# Windows voices for the shoutouts (the same voices the TV browser uses).
#   speak.ps1 -List                              prints the language of each installed voice, one per line
#   speak.ps1 -Lang fr -Text <base64> -Out x.wav  writes the spoken text (UTF-8, base64) as a WAV file
param([switch]$List, [string]$Lang = 'en', [string]$Text = '', [string]$Out = '')
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Runtime.WindowsRuntime
[void][Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]

$voices = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices
if ($List) {
  $voices | ForEach-Object { $_.Language }
  exit 0
}

# WinRT calls are asynchronous: wait for them through .NET tasks
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
function Await($op, [type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  [void]$task.Wait(-1)
  $task.Result
}

$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
# The system default voice if it speaks the language, else the first one that does
$default = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::DefaultVoice
$voice = if ($default.Language -like "$Lang*") { $default } else { $voices | Where-Object { $_.Language -like "$Lang*" } | Select-Object -First 1 }
if (-not $voice) { Write-Error "No $Lang voice"; exit 2 }
$synth.Voice = $voice

$words = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Text))
$stream = Await ($synth.SynthesizeTextToStreamAsync($words)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
$reader = New-Object Windows.Storage.Streams.DataReader($stream)
[void](Await ($reader.LoadAsync([uint32]$stream.Size)) ([uint32]))
$bytes = New-Object byte[] ([int]$stream.Size)
$reader.ReadBytes($bytes)
[IO.File]::WriteAllBytes($Out, $bytes)
