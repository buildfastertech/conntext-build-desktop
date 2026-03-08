param([string]$folder)
$files = Get-ChildItem $folder -File | Where-Object { $_.Extension -match '\.(png|jpg|jpeg|gif|bmp|webp|tiff)$' } | Sort-Object LastWriteTime -Descending
if ($files.Count -eq 0) {
    Write-Output "NO_FILES_FOUND"
} else {
    $f = $files[0]
    Write-Output $f.FullName
    Write-Output ("Taken: " + $f.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss"))
    Write-Output ("Size: " + [math]::Round($f.Length/1KB, 1).ToString() + " KB")
}
