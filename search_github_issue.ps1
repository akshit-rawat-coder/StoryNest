param([int]$issue)
try {
    $url = "https://api.github.com/repos/appwrite/appwrite/issues/$issue"
    $r = Invoke-RestMethod -Uri $url -Headers @{Accept='application/vnd.github.v3+json'} -TimeoutSec 15
    Write-Output ("TITLE: " + $r.title)
    Write-Output ("STATE: " + $r.state)
    Write-Output ("---BODY---")
    Write-Output $r.body
} catch {
    Write-Output ("ERROR: " + $_.Exception.Message)
}

