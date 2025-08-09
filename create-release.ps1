# Firefox Tab Volume Control - Simple Release Script
# Creates a release ZIP using native PowerShell commands

Write-Host "Firefox Tab Volume Control - Release Builder" -ForegroundColor Cyan

# Get version from manifest.json
$version = (Get-Content manifest.json | ConvertFrom-Json).version
$zipName = "tab-volume-control-v$version.zip"

Write-Host "Building version: $version" -ForegroundColor Yellow

# Remove existing ZIP if it exists
if (Test-Path $zipName) { 
    Remove-Item $zipName 
    Write-Host "Removed existing package" -ForegroundColor Yellow
}

# Create the release package
Write-Host "Creating release package..." -ForegroundColor Yellow

# Use .NET compression to ensure proper path separators for cross-platform compatibility
Add-Type -AssemblyName System.IO.Compression.FileSystem

# Create the ZIP file
$zip = [System.IO.Compression.ZipFile]::Open($zipName, [System.IO.Compression.ZipArchiveMode]::Create)

# Function to add files with proper path separators
function Add-FileToZip($zipArchive, $filePath, $entryName) {
    # Ensure forward slashes in entry name
    $entryName = $entryName -replace '\\', '/'
    $entry = $zipArchive.CreateEntry($entryName)
    $entryStream = $entry.Open()
    $fileStream = [System.IO.File]::OpenRead($filePath)
    $fileStream.CopyTo($entryStream)
    $fileStream.Close()
    $entryStream.Close()
}

# Function to add directory recursively
function Add-DirectoryToZip($zipArchive, $sourcePath, $entryPath) {
    foreach ($item in Get-ChildItem -Path $sourcePath -Recurse) {
        $relativePath = $item.FullName.Substring((Resolve-Path $sourcePath).Path.Length + 1)
        $entryName = if ($entryPath) { "$entryPath/$relativePath" } else { $relativePath }
        
        if ($item.PSIsContainer) {
            # Create directory entry
            $entryName = ($entryName -replace '\\', '/') + '/'
            $zip.CreateEntry($entryName) | Out-Null
        } else {
            # Add file
            Add-FileToZip $zipArchive $item.FullName $entryName
        }
    }
}

try {
    # Add individual files
    Add-FileToZip $zip (Resolve-Path "manifest.json").Path "manifest.json"
    Add-FileToZip $zip (Resolve-Path "LICENSE.md").Path "LICENSE.md" 
    Add-FileToZip $zip (Resolve-Path "README.md").Path "README.md"
    
    # Add src directory
    Add-DirectoryToZip $zip "src" "src"
    
    Write-Host "✅ Files added with proper path separators" -ForegroundColor Green
} finally {
    $zip.Dispose()
}

# Get package info
$size = [math]::Round((Get-Item $zipName).Length / 1KB, 1)
$sizeText = if ($size -gt 1024) { "$([math]::Round($size/1024, 1)) MB" } else { "$size KB" }

Write-Host ""
Write-Host "✅ Release package created successfully!" -ForegroundColor Green
Write-Host "📦 Package: $zipName" -ForegroundColor Green
Write-Host "📏 Size: $sizeText" -ForegroundColor Green
Write-Host "🏷️  Version: $version" -ForegroundColor Green
Write-Host ""
Write-Host "Ready for Firefox Add-on submission!" -ForegroundColor Cyan
