# QueenBee 서버 스크립트의 공통 값 — `server.ps1` 과 `server-run.ps1` 이 함께 씁니다.
#
# 이 파일은 **점 소싱(dot-source)** 으로만 씁니다:
#
#   . (Join-Path $PSScriptRoot 'server-common.ps1')
#
# 두 스크립트가 로그 위치를 따로 계산하면 「멀쩡히 돌고 있는데 로그가 없다」가
# 됩니다. 계산은 여기 한 곳에만 둡니다.
#
# ## 이 세 `.ps1` 은 **BOM 있는 UTF-8** 이어야 합니다
#
# Windows PowerShell 5.1 은 BOM 이 없는 `.ps1` 을 ANSI(한국어 PC 에서는 CP949)로
# 읽습니다. 그러면 한글 뒤의 따옴표가 «앞 글자의 뒷바이트»로 먹히면서 문자열이
# 안 닫히고, 스크립트 전체가 구문 오류로 죽습니다. 실행해 보기 전에는 안 보입니다.
# 편집기에서 인코딩을 바꾸지 마십시오.

Set-StrictMode -Off

# 포트는 3100 고정입니다 (DEC-028). 이 PC 의 다른 프로젝트가 3000 을 씁니다.
$QbPort = 3100

# 작업 스케줄러에 등록되는 이름. 「QueenBee 백업」·「QueenBee 유지보수」와 나란히 섭니다.
$QbTaskName = 'QueenBee 서버'

# scripts 의 부모 = project/
$QbProjectDir = Split-Path -Parent $PSScriptRoot
$QbRepoDir = Split-Path -Parent $QbProjectDir
$QbComposeFile = Join-Path $QbRepoDir 'docker\docker-compose.dev.yml'

<#
.SYNOPSIS
  project/.env 에서 값 하나를 읽는다. 없으면 $null.
.DESCRIPTION
  파서가 아닙니다 — `KEY=VALUE` 한 줄만 봅니다. 주석과 빈 줄은 건너뜁니다.
  앱이 읽는 그 파일을 그대로 보므로, 경로를 바꾸면 스크립트도 따라갑니다.
#>
function Get-QbEnvValue {
    param([Parameter(Mandatory)][string]$Name)

    $envFile = Join-Path $QbProjectDir '.env'
    if (-not (Test-Path $envFile)) { return $null }

    foreach ($line in (Get-Content -LiteralPath $envFile -Encoding UTF8)) {
        if ($line -match "^\s*$([regex]::Escape($Name))\s*=\s*(.*)$") {
            return $matches[1].Trim().Trim('"').Trim("'")
        }
    }
    return $null
}

<#
.SYNOPSIS
  서버 로그가 쌓이는 곳.
.DESCRIPTION
  **저장소 밖입니다** (DEC-016 과 같은 이유 — 커밋될 일이 없어야 합니다).
  `STORAGE_ROOT` 가 `E:\queenbee-data\files` 이면 `E:\queenbee-data\logs` 입니다.
#>
function Get-QbLogDir {
    $storage = Get-QbEnvValue 'STORAGE_ROOT'
    if ($storage) {
        $parent = Split-Path -Parent $storage
        if ($parent) { return (Join-Path $parent 'logs') }
    }
    return (Join-Path $env:LOCALAPPDATA 'queenbee\logs')
}

function Get-QbLogPath { Join-Path (Get-QbLogDir) 'server.log' }

<#
.SYNOPSIS
  3100 을 «듣고 있는» 프로세스. 없으면 $null.
.DESCRIPTION
  PID 파일을 쓰지 않습니다. 파일은 거짓말을 합니다 — 프로세스가 죽어도 남고,
  VS Code 터미널에서 띄운 서버는 애초에 파일을 안 남깁니다.
  **포트를 듣고 있는 것이 곧 서버**입니다.
#>
function Get-QbListener {
    try {
        $conn = @(Get-NetTCPConnection -LocalPort $QbPort -State Listen -ErrorAction Stop)
    } catch {
        return $null
    }
    if ($conn.Count -eq 0) { return $null }
    try { return (Get-Process -Id $conn[0].OwningProcess -ErrorAction Stop) } catch { return $null }
}

<#
.SYNOPSIS
  /api/health 를 읽어 객체로 준다. 못 받으면 $null.
.DESCRIPTION
  네 항목이 하나라도 fail 이면 서버는 **503** 으로 답합니다. 그때도 몸통에는
  「무엇이 fail 인지」가 들어 있으므로, 오류로 버리지 않고 읽어 냅니다.
#>
function Get-QbHealth {
    param([int]$TimeoutSec = 5)

    $url = "http://localhost:$QbPort/api/health"
    try {
        $res = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec $TimeoutSec
        return ($res.Content | ConvertFrom-Json)
    } catch {
        $response = $_.Exception.Response
        if ($response) {
            try {
                $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
                $body = $reader.ReadToEnd()
                $reader.Close()
                if ($body) { return ($body | ConvertFrom-Json) }
            } catch { }
        }
        return $null
    }
}

<#
.SYNOPSIS
  포트가 열릴 때까지 기다린다. 열리면 $true.
#>
function Wait-QbTcpPort {
    param(
        [Parameter(Mandatory)][int]$Port,
        [int]$TimeoutSec = 120
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        $client = New-Object System.Net.Sockets.TcpClient
        try {
            $client.Connect('127.0.0.1', $Port)
            return $true
        } catch {
        } finally {
            $client.Dispose()
        }
        Start-Sleep -Seconds 2
    }
    return $false
}
