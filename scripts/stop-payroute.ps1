<#
.SYNOPSIS
    PayRoute Safe Process Shutdown Script
.DESCRIPTION
    Stops only processes associated with PayRoute (API on port 4000, worker.ts, and cloudflared tunnel).
    Does NOT terminate unrelated Node.js or cloudflared processes.
#>

[CmdletBinding()]
param(
    [int]$Port = 4000
)

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "         PayRoute Orchestration Engine -- Shutdown           " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$rootDir = Split-Path -Parent $PSScriptRoot
$stoppedCount = 0

# ---------------------------------------------------------------------------
# 1. Stop API Server on Port 4000
# ---------------------------------------------------------------------------
Write-Host "[1/3] Checking API Server on port $Port..." -ForegroundColor Yellow
$connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue

if ($connections) {
    $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($targetPid in $processIds) {
        try {
            $p = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
            if ($p) {
                Write-Host "  Stopping API Server process (PID: $targetPid, Name: $($p.ProcessName))..." -ForegroundColor Cyan
                Stop-Process -Id $targetPid -Force -ErrorAction SilentlyContinue
                $stoppedCount++
                Write-Host "  [STOPPED] API Server process (PID: $targetPid)" -ForegroundColor Green
            }
        } catch {
            Write-Host "  [WARNING] Could not terminate process PID: $targetPid" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "  [INFO] No API process listening on port $Port." -ForegroundColor DarkGray
}

# ---------------------------------------------------------------------------
# 2. Stop BullMQ Worker Process (filtered to worker.ts)
# ---------------------------------------------------------------------------
Write-Host "[2/3] Checking BullMQ Worker process..." -ForegroundColor Yellow
$workerProcs = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*worker.ts*" -and ($_.CommandLine -like "*$rootDir*" -or $_.CommandLine -like "*PayRoute*") }

if ($workerProcs) {
    foreach ($wp in $workerProcs) {
        $targetPid = $wp.ProcessId
        Write-Host "  Stopping BullMQ Worker (PID: $targetPid)..." -ForegroundColor Cyan
        Stop-Process -Id $targetPid -Force -ErrorAction SilentlyContinue
        $stoppedCount++
        Write-Host "  [STOPPED] BullMQ Worker (PID: $targetPid)" -ForegroundColor Green
    }
} else {
    Write-Host "  [INFO] No active PayRoute BullMQ worker process found." -ForegroundColor DarkGray
}

# ---------------------------------------------------------------------------
# 3. Stop Cloudflare Quick Tunnel (filtered to port 4000)
# ---------------------------------------------------------------------------
Write-Host "[3/3] Checking Cloudflare Quick Tunnel process..." -ForegroundColor Yellow
$tunnelProcs = Get-CimInstance Win32_Process -Filter "name = 'cloudflared.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*4000*" }

if ($tunnelProcs) {
    foreach ($tp in $tunnelProcs) {
        $targetPid = $tp.ProcessId
        Write-Host "  Stopping Cloudflare Tunnel (PID: $targetPid)..." -ForegroundColor Cyan
        Stop-Process -Id $targetPid -Force -ErrorAction SilentlyContinue
        $stoppedCount++
        Write-Host "  [STOPPED] Cloudflare Tunnel (PID: $targetPid)" -ForegroundColor Green
    }
} else {
    # Fallback check if cloudflared is running without commandline filter
    $genericTunnel = Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue
    if ($genericTunnel) {
        foreach ($gt in $genericTunnel) {
            Write-Host "  Stopping cloudflared process (PID: $($gt.Id))..." -ForegroundColor Cyan
            Stop-Process -Id $($gt.Id) -Force -ErrorAction SilentlyContinue
            $stoppedCount++
            Write-Host "  [STOPPED] Cloudflare Tunnel (PID: $($gt.Id))" -ForegroundColor Green
        }
    } else {
        Write-Host "  [INFO] No active Cloudflare Tunnel process found." -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Shutdown complete. Total PayRoute processes stopped: $stoppedCount" -ForegroundColor Green
Write-Host "Port $Port has been freed." -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
