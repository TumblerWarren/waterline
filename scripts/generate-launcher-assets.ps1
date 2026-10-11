param([string]$Source = "$PSScriptRoot/../assets/waterline-icon-master.png")
Add-Type -AssemblyName System.Drawing
$taskRoot = [IO.Path]::GetFullPath("$PSScriptRoot/..")
$taskRes = Join-Path $taskRoot 'android/app/src/main/res'
$taskImage = [Drawing.Image]::FromFile([IO.Path]::GetFullPath($Source))
function Write-IconBitmap([string]$Path, [int]$Width, [int]$Height, [double]$Size, [bool]$Background, [bool]$Round) {
  $taskBitmap = New-Object Drawing.Bitmap($Width, $Height)
  $taskGraphics = [Drawing.Graphics]::FromImage($taskBitmap)
  $taskGraphics.SmoothingMode = 'AntiAlias'
  $taskGraphics.InterpolationMode = 'HighQualityBicubic'
  $taskGraphics.Clear([Drawing.Color]::Transparent)
  if ($Round) {
    $taskCircle = New-Object Drawing.Drawing2D.GraphicsPath
    $taskCircle.AddEllipse(0,0,$Width,$Height)
    $taskGraphics.SetClip($taskCircle)
    $taskCircle.Dispose()
  }
  if ($Background) {
    $taskBrush = New-Object Drawing.SolidBrush([Drawing.ColorTranslator]::FromHtml('#F3F8FF'))
    $taskGraphics.FillRectangle($taskBrush,0,0,$Width,$Height)
    $taskBrush.Dispose()
  }
  $taskGraphics.DrawImage($taskImage, [single](($Width-$Size)/2), [single](($Height-$Size)/2), [single]$Size, [single]$Size)
  $taskBitmap.Save($Path, [Drawing.Imaging.ImageFormat]::Png)
  $taskGraphics.Dispose()
  $taskBitmap.Dispose()
}
try {
  foreach ($taskDensity in @(@('mdpi',1),@('hdpi',1.5),@('xhdpi',2),@('xxhdpi',3),@('xxxhdpi',4))) {
    $taskDirectory = Join-Path $taskRes "mipmap-$($taskDensity[0])"
    $taskScale = [double]$taskDensity[1]
    Write-IconBitmap "$taskDirectory/ic_launcher_foreground.png" ([int](108*$taskScale)) ([int](108*$taskScale)) (70*$taskScale) $false $false
    Write-IconBitmap "$taskDirectory/ic_launcher.png" ([int](48*$taskScale)) ([int](48*$taskScale)) (40*$taskScale) $true $false
    Write-IconBitmap "$taskDirectory/ic_launcher_round.png" ([int](48*$taskScale)) ([int](48*$taskScale)) (40*$taskScale) $true $true
  }
  Write-IconBitmap "$taskRoot/public/waterline-icon.png" 512 512 512 $false $false
  Write-IconBitmap "$taskRoot/public/icon-192.png" 192 192 168 $true $false
  Write-IconBitmap "$taskRoot/public/icon-512.png" 512 512 448 $true $false
  foreach ($taskSplash in Get-ChildItem -LiteralPath $taskRes -Recurse -Filter splash.png) {
    $taskOld = [Drawing.Image]::FromFile($taskSplash.FullName)
    $taskWidth = $taskOld.Width; $taskHeight = $taskOld.Height; $taskOld.Dispose()
    $taskIconSize = [Math]::Min([Math]::Min($taskWidth,$taskHeight)*.38,420)
    Write-IconBitmap $taskSplash.FullName $taskWidth $taskHeight $taskIconSize $true $false
  }
} finally { $taskImage.Dispose() }
Write-Output 'Generated Android launcher, adaptive foreground, splash and web assets.'

