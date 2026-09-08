<#
.SYNOPSIS
  Neowave Work 서버를 VS Code 와 상관없이 띄우고 · 내리고 · 들여다본다.

.DESCRIPTION
  ```powershell
  npm run serve            # 띄운다 (개발 모드)
  npm run serve:status     # 살아 있는가
  npm run serve:logs       # 로그 끝을 본다
  npm run serve:stop       # 내린다
  npm run serve:install    # 이 PC 에 로그인하면 «자동으로» 뜨게 한다
  npm run serve:uninstall  # 자동 기동을 걷어낸다
  ```

  ## 무엇이 달라지는가

  VS Code 터미널에서 `npm run dev` 를 하면 그 서버는 **VS Code 의 자식**입니다.
  편집기를 끄면 함께 죽습니다. 이 스크립트는 서버를 **작업 스케줄러**에 맡깁니다
  — 편집기도, 터미널도, 이 PowerShell 창도 서버의 부모가 아니게 됩니다.

  이 저장소는 백업(03:00)과 유지보수(04:00)를 이미 작업 스케줄러로 돌립니다
  (`OPS-01` 2장). 서버를 같은 자리에 두는 것이라 새로 배울 것이 없습니다.

  ## 어디까지 버티는가

  | | |
  | --- | --- |
  | VS Code 종료 · 터미널 종료 | **버팁니다** |
  | 로그아웃 · 재부팅 | 내려갑니다. 다시 로그인하면 `serve:install` 이 띄웁니다 |
  | 이 PC 를 끄면 | 당연히 내려갑니다 — 1단계는 개발 PC 한 대입니다 (`DEC-001`) |

  Docker Desktop 이 사용자 로그인 뒤에 뜨므로, DB 도 로그인이 있어야 삽니다.
  「로그아웃해도 살아 있게」는 이 단계에서 만들 수 없는 약속입니다.

.PARAMETER Command
  start · stop · restart · status · logs · install · uninstall

.PARAMETER Mode
  dev(기본) — 코드를 고치면 바로 반영됩니다.
  prod      — 빌드 뒤 `npm start`. **사내망에 열 때는 이쪽입니다** (`DEC-023`):
              개발 서버로 열면 다른 PC 에서 자바스크립트가 하나도 안 돕니다.
  생략하면 이미 등록된 작업의 모드를 그대로 씁니다.

.PARAMETER NoDb
  컨테이너를 건드리지 않는다.

.PARAMETER Tail
  logs 가 보여 줄 줄 수 (기본 60).

.PARAMETER Follow
  logs 를 계속 따라간다 (Ctrl+C 로 나옴).

.EXAMPLE
  npm run serve -- -Mode prod
  사내망에 열 때. 빌드가 끝날 때까지 몇 분 기다립니다.
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('start', 'stop', 'restart', 'status', 'logs', 'install', 'uninstall')]
    [string]$Command = 'start',

    [ValidateSet('dev', 'prod')]
    [string]$Mode,

    [switch]$AtLogon,
    [switch]$NoDb,
    [int]$Tail = 60,
    [switch]$Follow
)

. (Join-Path $PSScriptRoot 'server-common.ps1')

$Runner = Join-Path $PSScriptRoot 'server-run.ps1'
$LogPath = Get-QbLogPath

function Write-Head { param([string]$Text) Write-Host ''; Write-Host $Text -ForegroundColor Cyan }
function Write-Ok { param([string]$Text) Write-Host "  ✓ $Text" -ForegroundColor Green }
function Write-Bad { param([string]$Text) Write-Host "  × $Text" -ForegroundColor Red }
function Write-Note { param([string]$Text) Write-Host "  $Text" -ForegroundColor DarkGray }

function Get-QbTask {
    try { return (Get-ScheduledTask -TaskName $QbTaskName -ErrorAction Stop) } catch { return $null }
}

# 등록된 작업이 어느 모드로 도는지 — 인자에 그대로 적혀 있습니다
function Get-QbTaskMode {
    param($Task)
    if (-not $Task) { return $null }
    $argline = ($Task.Actions | Select-Object -First 1).Arguments
    if ($argline -match '-Mode\s+(\w+)') { return $matches[1] }
    return $null
}

function Test-QbTaskAtLogon {
    param($Task)
    if (-not $Task) { return $false }
    return ($null -ne ($Task.Triggers | Where-Object { $_.CimClass.CimClassName -eq 'MSFT_TaskLogonTrigger' }))
}

<#
.SYNOPSIS
  작업을 등록(또는 갱신)한다.
.DESCRIPTION
  **이미 걸려 있는 트리거는 지키지 않으면 안 됩니다.** `install` 로 자동 기동을
  켜 둔 사람이 `start` 한 번에 그것을 잃으면, 다음 재부팅에 아무도 눈치채지
  못한 채 서버가 안 뜹니다.
#>
function Register-QbTask {
    param(
        [Parameter(Mandatory)][string]$TaskMode,
        [switch]$WithLogonTrigger,
        [switch]$SkipDb
    )

    $existing = Get-QbTask

    $argline = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden ' +
    "-File `"$Runner`" -Mode $TaskMode -LogPath `"$LogPath`""
    if ($SkipDb) { $argline += ' -NoDb' }

    $action = New-ScheduledTaskAction -Execute (Join-Path $PSHOME 'powershell.exe') `
        -Argument $argline -WorkingDirectory $QbProjectDir

    # ExecutionTimeLimit 0 = 「알아서 끊지 마라」. 기본값(3일)이면 사흘 뒤 서버가
    # 이유 없이 사라집니다. StartWhenAvailable 은 로그인이 늦어도 뜨게 합니다.
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
        -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) `
        -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

    $userId = "$env:USERDOMAIN\$env:USERNAME"
    $principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited

    $triggers = @()
    if ($WithLogonTrigger) {
        $trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
        # Docker Desktop 이 뜰 틈을 줍니다. 30초 뒤에도 안 떠 있으면 runner 가 기다립니다.
        try { $trigger.Delay = 'PT30S' } catch { }
        $triggers = @($trigger)
    } elseif ($existing -and $existing.Triggers) {
        $triggers = @($existing.Triggers)
    }

    $params = @{
        TaskName    = $QbTaskName
        Action      = $action
        Settings    = $settings
        Principal   = $principal
        Description = 'Neowave Work 애플리케이션 서버 (포트 3100). 편집기·터미널과 무관하게 돕니다 — project/scripts/server.ps1'
        Force       = $true
    }
    if ($triggers.Count -gt 0) { $params['Trigger'] = $triggers }

    Register-ScheduledTask @params | Out-Null
}

<#
.SYNOPSIS
  3100 을 잡고 있는 것을 끝낸다. 우리가 아는 프로세스일 때만.
#>
function Stop-QbListener {
    $listener = Get-QbListener
    if (-not $listener) { return $true }

    # 남의 프로세스는 건드리지 않습니다. 3100 은 우리 것이지만 «우리 것일
    # 것이다»로 죽여도 되는 프로세스는 없습니다.
    $known = @('node', 'npm', 'cmd', 'powershell', 'pwsh')
    if ($known -notcontains $listener.ProcessName) {
        Write-Bad "$QbPort 을 $($listener.ProcessName)(PID $($listener.Id)) 가 잡고 있습니다 — 우리 것이 아니라 두었습니다"
        return $false
    }

    # /T — 자식까지. next dev 는 워커를 여럿 낳습니다.
    & taskkill.exe /PID $listener.Id /T /F | Out-Null
    Start-Sleep -Seconds 2
    return ($null -eq (Get-QbListener))
}

function Show-QbStatus {
    $task = Get-QbTask
    $listener = Get-QbListener
    $health = if ($listener) { Get-QbHealth -TimeoutSec 10 } else { $null }

    Write-Head 'Neowave Work 서버'

    if ($listener) {
        Write-Ok "포트 $QbPort — $($listener.ProcessName) (PID $($listener.Id))"
    } else {
        Write-Bad "포트 $QbPort — 아무도 듣고 있지 않습니다"
    }

    if ($health) {
        $checks = ($health.checks.PSObject.Properties | ForEach-Object { "$($_.Name) $($_.Value)" }) -join ' · '
        if ($health.status -eq 'ok') { Write-Ok "health — $checks" } else { Write-Bad "health — $checks" }
        if ($health.details) {
            foreach ($d in $health.details.PSObject.Properties) { Write-Note "$($d.Name): $($d.Value)" }
        }
        Write-Note ("떠 있은 시간 {0}분 · 여유 디스크 {1}GB" -f [math]::Floor($health.uptime / 60), $health.diskFreeGb)
    } elseif ($listener) {
        Write-Note 'health 응답이 없습니다 — 개발 모드는 첫 요청에서 컴파일하느라 늦을 수 있습니다'
    }

    if ($task) {
        $state = $task | Get-ScheduledTaskInfo
        $taskMode = Get-QbTaskMode $task
        Write-Ok "작업 「$QbTaskName」 등록됨 — $taskMode 모드 · 상태 $($task.State)"
        if (Test-QbTaskAtLogon $task) {
            Write-Ok '로그인하면 자동으로 뜹니다'
        } else {
            Write-Note '자동 기동은 꺼져 있습니다 — 켜려면 npm run serve:install'
        }
        if ($state.LastRunTime -and $state.LastRunTime.Year -gt 1999) {
            # 267009(0x41301)는 「아직 돌고 있음」입니다. 숫자로 두면 오류처럼 읽힙니다.
            $result = switch ($state.LastTaskResult) {
                0 { '정상 종료' }
                267009 { '돌고 있음' }
                default { "코드 $($state.LastTaskResult)" }
            }
            Write-Note ("마지막 실행 {0} · {1}" -f $state.LastRunTime, $result)
        }
    } else {
        Write-Note "작업 「$QbTaskName」 미등록 — npm run serve 가 등록합니다"
    }

    Write-Note "로그 $LogPath"
    Write-Host ''
}

<#
.SYNOPSIS
  뜰 때까지 기다린다. 안 뜨면 로그 끝을 보여 준다.
#>
function Wait-QbUp {
    param([string]$TaskMode)

    # 운영 모드는 빌드부터 합니다 — 몇 분입니다.
    $timeout = if ($TaskMode -eq 'prod') { 900 } else { 240 }

    Write-Host -NoNewline "  기다립니다"
    $deadline = (Get-Date).AddSeconds($timeout)
    while ((Get-Date) -lt $deadline) {
        if (Get-QbListener) {
            Write-Host ''
            # 포트가 열려도 개발 모드는 첫 요청에서 컴파일합니다. 넉넉히 기다립니다.
            $health = Get-QbHealth -TimeoutSec 120
            if ($health) { return $health }
            return $null
        }
        Start-Sleep -Seconds 3
        Write-Host -NoNewline '.'
    }

    Write-Host ''
    return $null
}

function Show-QbLogTail {
    param([int]$Lines = 20)
    if (-not (Test-Path $LogPath)) { return }
    Write-Note '--- 로그 끝 ---'
    Get-Content -LiteralPath $LogPath -Tail $Lines | ForEach-Object { Write-Note $_ }
}

function Start-QbServer {
    param([switch]$WithLogonTrigger)

    $listener = Get-QbListener
    if ($listener) {
        Write-Head '이미 떠 있습니다'
        Write-Note "$QbPort 을 $($listener.ProcessName)(PID $($listener.Id)) 가 듣고 있습니다."
        Write-Note 'VS Code 터미널에서 돌고 있는 것이라면 그 터미널을 먼저 끄고(또는 npm run serve:stop) 다시 부르십시오.'
        Show-QbStatus
        return
    }

    $task = Get-QbTask
    $taskMode = if ($Mode) { $Mode } elseif (Get-QbTaskMode $task) { Get-QbTaskMode $task } else { 'dev' }

    Write-Head "서버를 띄웁니다 — $taskMode 모드"

    try {
        Register-QbTask -TaskMode $taskMode -WithLogonTrigger:$WithLogonTrigger -SkipDb:$NoDb
    } catch {
        Write-Bad "작업 스케줄러에 등록하지 못했습니다 — $($_.Exception.Message)"
        Write-Note '관리자 PowerShell 에서 한 번 등록하면 그 뒤로는 일반 권한으로 됩니다.'
        exit 1
    }

    if ($WithLogonTrigger) { Write-Ok '로그인하면 자동으로 뜨도록 등록했습니다' }

    Start-ScheduledTask -TaskName $QbTaskName
    if ($taskMode -eq 'prod') { Write-Note '운영 빌드부터 합니다 — 몇 분 걸립니다' }

    $health = Wait-QbUp -TaskMode $taskMode
    if ($health) {
        $checks = ($health.checks.PSObject.Properties | ForEach-Object { "$($_.Name) $($_.Value)" }) -join ' · '
        if ($health.status -eq 'ok') {
            Write-Ok "http://localhost:$QbPort — $checks"
        } else {
            Write-Bad "떴지만 health 가 fail 입니다 — $checks"
        }
        Write-Note '이제 VS Code 를 꺼도 됩니다. 내릴 때는 npm run serve:stop'
    } elseif (Get-QbListener) {
        Write-Ok "http://localhost:$QbPort 가 열렸습니다 (health 응답은 아직)"
        Write-Note '이제 VS Code 를 꺼도 됩니다. 내릴 때는 npm run serve:stop'
    } else {
        Write-Bad '뜨지 않았습니다'
        Show-QbLogTail
        exit 1
    }
    Write-Host ''
}

function Stop-QbServer {
    Write-Head '서버를 내립니다'

    if (Get-QbTask) {
        try { Stop-ScheduledTask -TaskName $QbTaskName -ErrorAction Stop } catch { }
        Start-Sleep -Seconds 2
    }

    # 작업을 끝내도 손자 프로세스가 포트를 붙들고 있는 일이 있습니다.
    # 「내렸다」는 말은 **포트가 비었을 때만** 참입니다.
    if (Stop-QbListener) {
        Write-Ok "포트 $QbPort 이 비었습니다"
    } else {
        Write-Bad "포트 $QbPort 이 아직 잡혀 있습니다 — npm run serve:status 로 누구인지 보십시오"
        exit 1
    }
    Write-Host ''
}

switch ($Command) {
    'start' { Start-QbServer -WithLogonTrigger:$AtLogon }
    'stop' { Stop-QbServer }
    'restart' { Stop-QbServer; Start-QbServer }
    'status' { Show-QbStatus }
    'install' { Start-QbServer -WithLogonTrigger }
    'uninstall' {
        Stop-QbServer
        if (Get-QbTask) {
            Unregister-ScheduledTask -TaskName $QbTaskName -Confirm:$false
            Write-Ok "작업 「$QbTaskName」 을 지웠습니다 — 이제 자동으로 뜨지 않습니다"
        } else {
            Write-Note '등록된 작업이 없습니다'
        }
        Write-Host ''
    }
    'logs' {
        if (-not (Test-Path $LogPath)) {
            Write-Bad "로그가 아직 없습니다 — $LogPath"
            exit 1
        }
        if ($Follow) {
            Get-Content -LiteralPath $LogPath -Tail $Tail -Wait
        } else {
            Get-Content -LiteralPath $LogPath -Tail $Tail
        }
    }
}
