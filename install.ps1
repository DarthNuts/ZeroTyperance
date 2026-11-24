# ZeroTyperance 0.3.1 installer for Windows (Windows PowerShell 5.1 or PowerShell 7).
#   irm https://github.com/DarthNuts/ZeroTyperance/releases/latest/download/install.ps1 | iex
#   uninstall: $env:ZT_UNINSTALL=1; irm https://github.com/DarthNuts/ZeroTyperance/releases/latest/download/install.ps1 | iex
# It installs the game page, the co-op server and a private copy of Node.js 24.22.2 (from nodejs.org, checked
# against a pinned SHA-256) into %LOCALAPPDATA%\Programs\ZeroTyperance, adds that folder to your user PATH (command
# `zerotyperance`) and a Start menu entry. No administrator rights. The original ROM image is downloaded from
# technopop.net (royalty-free for distribution by its copyright owner; SHA-256 pinned) unless ZT_NO_ROM=1; without it
# the page asks for yours.
# Environment: ZT_PREFIX, ZT_RELEASE_BASE (where the release files are), ZT_NO_PATH=1, ZT_NO_SHORTCUT=1, ZT_UNINSTALL=1,
# ZT_NO_ROM=1, ZT_ROM_URLS (where the ROM zip is, space-separated).
# Runs as one script block so that `irm | iex` never closes your PowerShell window on an error.
& {
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$ztVersion = '0.3.1'
$nodeVersion = '24.22.2'
$base = if ($env:ZT_RELEASE_BASE) { $env:ZT_RELEASE_BASE.TrimEnd('/') } else { 'https://github.com/DarthNuts/ZeroTyperance/releases/latest/download' }
$prefix = if ($env:ZT_PREFIX) { $env:ZT_PREFIX } else { Join-Path $env:LOCALAPPDATA 'Programs\ZeroTyperance' }
$archive = 'zerotyperance.zip'
$shortcutDir = if ($env:ZT_SHORTCUT_DIR) { $env:ZT_SHORTCUT_DIR } else { [Environment]::GetFolderPath('Programs') }
$shortcut = Join-Path $shortcutDir 'ZeroTyperance.lnk'
$envKey = if ($env:ZT_TEST_ENV_KEY) { $env:ZT_TEST_ENV_KEY } else { 'Environment' } # the test suite points it at a scratch key

function Say([string]$m) { Write-Host "zerotyperance: $m" }
function IsOurs([string]$d) { (Test-Path -LiteralPath (Join-Path $d 'launch.mjs')) -and (Test-Path -LiteralPath (Join-Path $d 'VERSION')) }
# Copies an update moved aside while they were running ("<prefix>.old-" + 8 hex digits, the only name it gives them):
# removed once they have stopped. Nothing else beside the prefix is touched.
function Remove-OldCopies {
  $leaf = Split-Path -Leaf $prefix
  $re = '^' + [Regex]::Escape($leaf) + '\.old-[0-9a-f]{8}$'
  Get-ChildItem -LiteralPath (Split-Path -Parent $prefix) -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match $re } |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
}

# The user PATH is read and written in the registry as it is stored (REG_EXPAND_SZ keeps its %VARIABLES%), and only
# when it changes; then Windows is told, so that new terminals see it.
function Get-UserPathRaw {
  $k = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($envKey)
  if (-not $k) { return '' }
  try { return [string]$k.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) } finally { $k.Close() }
}
function Set-UserPathRaw([string]$value) {
  $k = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($envKey)
  try {
    $kind = [Microsoft.Win32.RegistryValueKind]::ExpandString
    try { if ($k.GetValue('Path') -ne $null) { $kind = $k.GetValueKind('Path') } } catch { }
    $k.SetValue('Path', $value, $kind)
  } finally { $k.Close() }
  if ($envKey -ne 'Environment') { return }
  try {
    Add-Type -Namespace ZeroTyperance -Name Native -ErrorAction Stop -MemberDefinition '[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint msg, UIntPtr wParam, string lParam, uint flags, uint timeout, out UIntPtr result);'
  } catch { }
  try { $r = [UIntPtr]::Zero; [void][ZeroTyperance.Native]::SendMessageTimeout([IntPtr]0xffff, 0x1A, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$r) } catch { }
}
function Test-InPath([string]$list, [string]$dir) {
  foreach ($x in $list.Split(';')) { if ($x -and $x.TrimEnd('\') -eq $dir.TrimEnd('\')) { return $true } }
  return $false
}

if ($env:ZT_UNINSTALL -eq '1') {
  if (-not (IsOurs $prefix)) { Say "not installed in $prefix"; return }
  $running = @(Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) })
  if ($running.Count -gt 0) { throw "zerotyperance: ZeroTyperance is running: close its window and uninstall again" }
  Remove-Item -LiteralPath $prefix -Recurse -Force
  Remove-OldCopies
  if (($env:ZT_NO_SHORTCUT -ne '1') -and (Test-Path -LiteralPath $shortcut)) { Remove-Item -LiteralPath $shortcut -Force }
  $p = Get-UserPathRaw
  if (($env:ZT_NO_PATH -ne '1') -and (Test-InPath $p $prefix)) {
    Set-UserPathRaw ((@($p.Split(';') | Where-Object { $_ -and ($_.TrimEnd('\') -ne $prefix.TrimEnd('\')) })) -join ';')
  }
  Say "removed $prefix (and its Start menu and PATH entries)"
  Say "the browser keeps the extracted assets for http://localhost:8802 until you clear that site's data"
  return
}

if ((Test-Path -LiteralPath $prefix) -and -not (IsOurs $prefix) -and (Get-ChildItem -LiteralPath $prefix -Force | Select-Object -First 1)) {
  throw "zerotyperance: $prefix exists and is not a ZeroTyperance install; set ZT_PREFIX to another folder"
}

# GitHub needs TLS 1.2; Windows PowerShell 5.1 may not offer it by default.
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }

$arch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
switch ($arch) {
  'AMD64' { $nodeArch = 'win-x64'; $nodeSha = 'ca1bff5d8ead13c9f2ea404a176db46bd430704d5b5113734049fa365e7799e2' }
  'ARM64' { $nodeArch = 'win-arm64'; $nodeSha = 'f47968c213105077f64c6510f007632c0ca2574802a0b5067c327c49abe1c468' }
  default { throw "zerotyperance: no Node.js build for this CPU ($arch)" }
}
$nodeDir = "node-v$nodeVersion-$nodeArch"
$nodeUrl = "https://nodejs.org/dist/v$nodeVersion/$nodeDir.zip"

function Fetch([string]$url, [string]$file) {
  try { Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $file }
  catch { throw "zerotyperance: download failed: $url ($($_.Exception.Message))" }
}
function Sha256([string]$file) { (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("zerotyperance-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  Say "downloading ZeroTyperance from $base"
  Fetch "$base/SHA256SUMS" (Join-Path $tmp 'SHA256SUMS')
  Fetch "$base/$archive" (Join-Path $tmp $archive)
  $want = $null
  foreach ($line in Get-Content -LiteralPath (Join-Path $tmp 'SHA256SUMS')) {
    $f = $line -split '\s+', 2
    if ($f.Count -eq 2 -and $f[1].TrimStart('*') -eq $archive) { $want = $f[0].ToLowerInvariant() }
  }
  if (-not $want) { throw "zerotyperance: SHA256SUMS has no line for $archive" }
  if ((Sha256 (Join-Path $tmp $archive)) -ne $want) { throw "zerotyperance: $archive does not match its SHA-256" }
  $new = Join-Path $tmp 'new'
  [IO.Compression.ZipFile]::ExtractToDirectory((Join-Path $tmp $archive), $new)
  $stage = Join-Path $new 'ZeroTyperance'
  if (-not (Test-Path -LiteralPath (Join-Path $stage 'launch.mjs'))) { throw "zerotyperance: the archive has no ZeroTyperance\launch.mjs" }
  $gotVersion = (Get-Content -LiteralPath (Join-Path $stage 'VERSION') -TotalCount 1).Trim()

  $stageNode = Join-Path $stage 'node'
  New-Item -ItemType Directory -Path $stageNode -Force | Out-Null
  $oldNode = Join-Path $prefix 'node\node.exe'
  $oldOk = $false
  if (Test-Path -LiteralPath $oldNode) { try { $oldOk = ((& $oldNode --version) -eq "v$nodeVersion") } catch { } }
  if ($oldOk) {
    Say "Node.js $nodeVersion already installed"
    Copy-Item -Path (Join-Path $prefix 'node\*') -Destination $stageNode -Recurse -Force
  } else {
    Say "downloading Node.js $nodeVersion ($nodeArch) from nodejs.org"
    $nodeZip = Join-Path $tmp 'node.zip'
    Fetch $nodeUrl $nodeZip
    if ((Sha256 $nodeZip) -ne $nodeSha) { throw "zerotyperance: the Node.js download does not match its pinned SHA-256" }
    $z = [IO.Compression.ZipFile]::OpenRead($nodeZip)
    try {
      foreach ($e in $z.Entries) {
        if ($e.FullName -eq "$nodeDir/node.exe" -or $e.FullName -eq "$nodeDir/LICENSE") {
          [IO.Compression.ZipFileExtensions]::ExtractToFile($e, (Join-Path $stageNode $e.Name), $true)
        }
      }
    } finally { $z.Dispose() }
  }
  $nodeExe = Join-Path $stageNode 'node.exe'
  if (-not (Test-Path -LiteralPath $nodeExe)) { throw "zerotyperance: node.exe is missing after the download" }
  & $nodeExe --version | Out-Null

  # The ROM image: the original, which its copyright owner Randel Reiss made royalty-free for distribution
  # (technopop.net). Downloaded from there (the archive.org copy as the fallback), never from this project.
  $romZipSha = '5d8f7f96dcab8ed7679ae0d92959b784517c541821f903e95f671308505b8e01'
  $romSha = '02e98d4dbf68c2279bf1471bfc7df4d6b8dc864435582beea92d2915febd0eeb'
  $romUrls = if ($env:ZT_ROM_URLS) { @($env:ZT_ROM_URLS -split '\s+' | Where-Object { $_ }) } else { @('http://www.technopop.net/images/zerotole.zip', 'https://web.archive.org/web/20180310132236id_/http://www.technopop.net/images/zerotole.zip') }
  $romNew = Join-Path $stage 'rom'
  $romOld = Join-Path $prefix 'rom\Zerotole.bin'
  if (Test-Path -LiteralPath $romOld) {
    # an update keeps the ROM image already there, whoever put it there
    New-Item -ItemType Directory -Path $romNew -Force | Out-Null
    Copy-Item -LiteralPath $romOld -Destination (Join-Path $romNew 'Zerotole.bin')
    if ((Sha256 $romOld) -eq $romSha) { Say "the ROM image is already installed" }
    else { Say "kept the ROM image in $prefix\rom (not the pinned one; delete it and run this again to download that)" }
  } elseif ($env:ZT_NO_ROM -eq '1') {
    Say "ZT_NO_ROM=1: no ROM image downloaded; the page will ask you for one"
  } else {
    $got = $false
    foreach ($u in $romUrls) {
      Say "downloading the Zero Tolerance ROM image from $u"
      $romZip = Join-Path $tmp 'rom.zip'
      try {
        Invoke-WebRequest -UseBasicParsing -Uri $u -OutFile $romZip
        if ((Sha256 $romZip) -eq $romZipSha) {
          New-Item -ItemType Directory -Path $romNew -Force | Out-Null
          $z = [IO.Compression.ZipFile]::OpenRead($romZip)
          try {
            $e = $z.Entries | Where-Object { $_.FullName -eq 'Zerotole.bin' } | Select-Object -First 1
            if ($e) { [IO.Compression.ZipFileExtensions]::ExtractToFile($e, (Join-Path $romNew 'Zerotole.bin'), $true) }
          } finally { $z.Dispose() }
          $romFile = Join-Path $romNew 'Zerotole.bin'
          if ((Test-Path -LiteralPath $romFile) -and ((Sha256 $romFile) -eq $romSha)) { $got = $true; break }
          Remove-Item -LiteralPath $romNew -Recurse -Force -ErrorAction SilentlyContinue
        }
      } catch { }
      Say "that copy failed or does not match its pinned SHA-256"
    }
    if ($got) { Say "ROM image installed (royalty-free for distribution by its copyright owner, Randel Reiss: technopop.net)" }
    else { Say "no ROM image could be downloaded: the page will ask you for one" }
  }

  Set-Content -LiteralPath (Join-Path $stage 'zerotyperance.cmd') -Encoding Ascii -Value "@echo off`r`n`"%~dp0node\node.exe`" `"%~dp0launch.mjs`" %*"

  $parent = Split-Path -Parent $prefix
  if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  # Earlier copies that were still running at their update: removed now if they have stopped.
  Remove-OldCopies
  $old = "$prefix.old-" + [Guid]::NewGuid().ToString('N').Substring(0, 8)
  if (Test-Path -LiteralPath $prefix) {
    try { Move-Item -LiteralPath $prefix -Destination $old }
    catch { throw "zerotyperance: $prefix is in use: close ZeroTyperance (its window) and run the installer again" }
  }
  Move-Item -LiteralPath $stage -Destination $prefix
  if (Test-Path -LiteralPath $old) {
    Remove-Item -LiteralPath $old -Recurse -Force -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $old) { Say "the running copy keeps running until you close its window; the next start uses the new version" }
  }
} finally {
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}

if ($env:ZT_NO_PATH -ne '1') {
  $p = Get-UserPathRaw
  if (-not (Test-InPath $p $prefix)) {
    $newPath = if ($p) { $p.TrimEnd(';') + ';' + $prefix } else { $prefix }
    Set-UserPathRaw $newPath
    Say "added $prefix to your user PATH (new terminals know 'zerotyperance')"
  }
  if (-not (Test-InPath $env:Path $prefix)) { $env:Path = "$env:Path;$prefix" }
}
if ($env:ZT_NO_SHORTCUT -ne '1') {
  $w = New-Object -ComObject WScript.Shell
  $lnk = $w.CreateShortcut($shortcut)
  $lnk.TargetPath = Join-Path $prefix 'node\node.exe'
  $lnk.Arguments = '"' + (Join-Path $prefix 'launch.mjs') + '"'
  $lnk.WorkingDirectory = $prefix
  $lnk.Description = 'ZeroTyperance'
  $lnk.Save()
  Say "added ZeroTyperance to the Start menu"
}
Say "installed ZeroTyperance $gotVersion in $prefix"
if ($gotVersion -ne $ztVersion) { Say "note: this installer is $ztVersion, the downloaded release is $gotVersion" }
Say "start it with: zerotyperance (or from the Start menu)"
if (Test-Path -LiteralPath (Join-Path $prefix 'rom\Zerotole.bin')) {
  Say "it serves the game on http://localhost:8802/ and opens your browser; the page extracts its assets from the ROM image"
} else {
  Say "it serves the game on http://localhost:8802/ and opens your browser; the page asks you for your ROM image"
}
Say "the first start may ask whether Node.js may use the network: allow private networks for co-op on your LAN"
}
