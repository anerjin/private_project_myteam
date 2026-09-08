<#
.SYNOPSIS
  Neowave Work 서버를 실제로 띄우는 스크립트. **사람이 직접 부르지 않습니다.**

.DESCRIPTION
  작업 스케줄러의 「Neowave Work 서버」 작업이 이것을 부릅니다. 사람이 쓰는 문은
  `server.ps1` 입니다 (`npm run serve`).

  ## 왜 작업 스케줄러가 부르는가

  VS Code 의 터미널에서 띄운 서버는 **VS Code 를 끄면 함께 죽습니다.** 터미널이
  자기가 낳은 프로세스 묶음을 통째로 정리하기 때문입니다. 창을 하나 더 띄워
  두는 것도 그 창을 닫으면 같은 일이 벌어집니다.

  작업 스케줄러가 띄운 프로세스는 **어느 창의 자식도 아닙니다.** 편집기를 꺼도,
  터미널을 다 닫아도 그대로 돕니다. 이 저장소가 백업·유지보수를 이미 그렇게
  돌리고 있으므로(`OPS-01` 2장), 서버도 같은 자리에 둡니다.

  ## 순서가 있습니다

  컨테이너가 먼저입니다 (`OPS-01` 1장). 앱이 먼저 뜨면 DB 연결에 실패하고 그
  오류는 화면에 「처리 중 문제가 발생했습니다」로만 보입니다. 로그인 직후라면
  Docker 엔진 자체가 아직 안 떠 있을 수 있으므로 **기다립니다.**

.PARAMETER Mode
  dev  — `npm run dev`. 코드를 고치면 바로 반영됩니다 (평소 개발용)
  prod — `npm run build` 뒤 `npm start`. 사내망에 열 때는 이쪽입니다 (DEC-023)

.PARAMETER LogPath
  로그 파일. 생략하면 `STORAGE_ROOT` 옆의 `logs\server.log`.

.PARAMETER NoDb
  컨테이너를 기다리지도, 띄우지도 않는다. 이미 돌고 있을 때.
#>
[CmdletBinding()]
param(
    [ValidateSet('dev', 'prod')]
    [string]$Mode = 'dev',

    [string]$LogPath,

    [switch]$NoDb
)

. (Join-Path $PSScriptRoot 'server-common.ps1')

if (-not $LogPath) { $LogPath = Get-QbLogPath }

$logDir = Split-Path -Parent $LogPath
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }

# 로그 갈이 — 지난 판 한 벌만 남깁니다. 몇 달치를 쌓아 두면 정작 오늘 것을 못 찾습니다.
if (Test-Path $LogPath) {
    $prev = Join-Path $logDir 'server.prev.log'
    Move-Item -LiteralPath $LogPath -Destination $prev -Force
}

function Write-Log {
    param([string]$Message)
    $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
}

# 네이티브 명령의 출력을 로그에 «이어» 붙인다.
#
# PowerShell 5.1 에서 네이티브 명령에 `2>&1` 을 직접 걸면 stderr 한 줄마다
# ErrorRecord 가 만들어져 정상 종료(0)도 실패처럼 보입니다. 그래서 방향 전환을
# cmd 에게 맡깁니다 — 종료 코드는 $LASTEXITCODE 로 그대로 옵니다.
function Invoke-Logged {
    param([Parameter(Mandatory)][string]$CommandLine)
    & $env:ComSpec /c "$CommandLine >> ""$LogPath"" 2>&1"
    return $LASTEXITCODE
}

function Get-UrlPort {
    param([string]$Url, [int]$Fallback)
    if ($Url -and $Url -match '^[a-z]+://(?:[^@/]*@)?[^:/]+:(\d+)') { return [int]$matches[1] }
    return $Fallback
}

Set-Location -LiteralPath $QbProjectDir

Write-Log "Neowave Work 서버 — $Mode 모드 · $QbProjectDir"
Write-Log "로그: $LogPath (지난 판은 server.prev.log)"

# ── 1. 컨테이너가 먼저 ──────────────────────────────────────────────────
if ($NoDb) {
    Write-Log '컨테이너는 건너뜁니다 (-NoDb)'
} else {
    Write-Log 'Docker 엔진을 기다립니다 (최대 5분)'
    $engineUp = $false
    $deadline = (Get-Date).AddMinutes(5)
    while ((Get-Date) -lt $deadline) {
        & $env:ComSpec /c 'docker info >nul 2>&1'
        if ($LASTEXITCODE -eq 0) { $engineUp = $true; break }
        Start-Sleep -Seconds 5
    }

    if (-not $engineUp) {
        # 여기서 멈춥니다. 엔진이 없으면 DB 도 없고, DB 없는 서버는 화면만
        # 뜨고 아무것도 안 됩니다 — 그 상태를 «떠 있다»고 부르면 안 됩니다.
        Write-Log 'Docker 엔진이 5분 안에 뜨지 않았습니다 — 서버를 띄우지 않습니다'
        Write-Log 'Docker Desktop 을 켠 뒤 `npm run serve` 를 다시 부르십시오'
        exit 1
    }

    Write-Log '컨테이너를 올립니다 (postgres · redis)'
    $code = Invoke-Logged "docker compose -f ""$QbComposeFile"" up -d"
    if ($code -ne 0) { Write-Log "docker compose 가 $code 로 끝났습니다 — 그래도 포트를 확인해 봅니다" }

    $pgPort = Get-UrlPort (Get-QbEnvValue 'DATABASE_URL') 5433
    $redisPort = Get-UrlPort (Get-QbEnvValue 'REDIS_URL') 6380

    if (-not (Wait-QbTcpPort -Port $pgPort -TimeoutSec 120)) {
        Write-Log "PostgreSQL($pgPort) 이 응답하지 않습니다 — 서버를 띄우지 않습니다"
        exit 1
    }
    if (-not (Wait-QbTcpPort -Port $redisPort -TimeoutSec 60)) {
        Write-Log "Redis($redisPort) 가 응답하지 않습니다 — 서버를 띄우지 않습니다"
        exit 1
    }
    Write-Log "컨테이너 준비됨 (postgres $pgPort · redis $redisPort)"
}

# ── 2. 앱 ───────────────────────────────────────────────────────────────
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    Write-Log 'npm 을 찾지 못했습니다 — Node.js 가 PATH 에 있는지 보십시오'
    exit 1
}

if ($Mode -eq 'prod') {
    Write-Log '운영 빌드 — 몇 분 걸립니다 (npm run build)'
    $code = Invoke-Logged 'npm.cmd run build'
    if ($code -ne 0) {
        # 빌드가 깨졌는데 `npm start` 를 부르면 «지난 빌드»가 뜹니다.
        # 고친 줄 알고 보는 화면이 옛것이면 그게 더 나쁩니다.
        Write-Log "빌드 실패 (exit $code) — 서버를 띄우지 않습니다. 로그 끝을 보십시오"
        exit 1
    }
    Write-Log "서버 기동 — npm start (포트 $QbPort)"
    $code = Invoke-Logged 'npm.cmd start'
} else {
    Write-Log "서버 기동 — npm run dev (포트 $QbPort)"
    $code = Invoke-Logged 'npm.cmd run dev'
}

Write-Log "서버가 멈췄습니다 (exit $code)"
exit $code
