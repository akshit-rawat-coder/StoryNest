param([string]$queryParam)
try {
    $url = "https://api.github.com/search/code?q=$queryParam&per_page=10"
    $r = Invoke-RestMethod -Uri $url -Headers @{Accept='application/vnd.github.v3+json'} -TimeoutSec 15
    foreach ($item in $r.items) {
        Write-Output ("PATH: " + $item.path)
        Write-Output ("URL: " + $item.html_url)
        Write-Output ("---")
    }
} catch {
    Write-Output ("ERROR: " + $_.Exception.Message)
}

