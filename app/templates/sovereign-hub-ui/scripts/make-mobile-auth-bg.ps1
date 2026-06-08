Add-Type -AssemblyName System.Drawing

$srcPath = Join-Path $PSScriptRoot "..\public\images\titan-auth-bg.jpg"
$outPath = Join-Path $PSScriptRoot "..\public\images\auth-mobile-dragon-bg.jpg"

$src = [System.Drawing.Image]::FromFile($srcPath)
$cropX = 500
$cropW = $src.Width - $cropX
$cropH = $src.Height

$crop = New-Object System.Drawing.Bitmap $cropW, $cropH
$g = [System.Drawing.Graphics]::FromImage($crop)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$srcRect = New-Object System.Drawing.Rectangle $cropX, 0, $cropW, $cropH
$g.DrawImage($src, 0, 0, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

$pw = 1080
$ph = 1920
$final = New-Object System.Drawing.Bitmap $pw, $ph
$g2 = [System.Drawing.Graphics]::FromImage($final)
$g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g2.Clear([System.Drawing.Color]::FromArgb(255, 1, 3, 10))

$targetH = [int]($ph * 0.44)
$scale = $targetH / $cropH
$dw = [int]($cropW * $scale)
$dh = [int]($cropH * $scale)
$dx = [int]($pw * 0.48 - $dw * 0.68)
$dy = [int]($ph * 0.03)
$g2.DrawImage($crop, $dx, $dy, $dw, $dh)

$fadeTop = [int]($ph * 0.26)
$fadeH = [int]($ph * 0.3)
$rect = New-Object System.Drawing.Rectangle 0, $fadeTop, $pw, $fadeH
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, [System.Drawing.Color]::FromArgb(0, 1, 3, 10), [System.Drawing.Color]::FromArgb(255, 1, 3, 10), [System.Drawing.Drawing2D.LinearGradientMode]::Vertical
$g2.FillRectangle($brush, $rect)

$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
$ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 94L)
$final.Save($outPath, $enc, $ep)

$brush.Dispose()
$g.Dispose()
$g2.Dispose()
$crop.Dispose()
$final.Dispose()
$src.Dispose()

Write-Output "saved $outPath"
