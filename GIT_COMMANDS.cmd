@echo off
REM Put these files into the root of your cloned repo, then run this from CMD.

cd /d D:\Malik-AI-TITAN

copy /Y "%~dp0pitch.html" "pitch.html"
copy /Y "%~dp0press.html" "press.html"
copy /Y "%~dp0README.md" "README.md"
copy /Y "%~dp0robots.txt" "robots.txt"
copy /Y "%~dp0sitemap.xml" "sitemap.xml"

git add -A
git commit -m "Add investor pitch deck and press kit for MALIK AI launch"
git push origin main

echo Done. After deploy, use these links:
echo https://malikaiworld.world/pitch.html
echo https://malikaiworld.world/press.html
pause
