param([string]$query)
try {
    $url = "https://api.github.com/search/issues?q=$query&per_page=10"
    $result = Invoke-RestMethod -Uri $url -Headers @{Accept='application/vnd.github.v3+json'} -TimeoutSec 15
    foreach ($item in $result.items) {
        Write-Output ("TITLE: " + $item.title)
        Write-Output ("URL: " + $item.html_url)
        Write-Output ("STATE: " + $item.state)
        Write-Output ("---")
    }
} catch {
    Write-Output ("ERROR: " + $_.Exception.Message)
}

