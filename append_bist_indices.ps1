param(
    [Parameter(Mandatory = $true)][string]$XlsxPath,
    [Parameter(Mandatory = $true)][string]$CachePath,
    # Which codes (from the cache) to append this run - defaults to the original 12 KYD/BIST
    # anlık-only series (28.08.2026 batch). Pass -Batch getiri for the 7 true "Getiri" index
    # series (28.08.2026 second batch) instead.
    [ValidateSet('kyd', 'getiri')][string]$Batch = 'kyd'
)

$ErrorActionPreference = "Stop"

$namesByBatch = @{
    'kyd'    = @{
        'ATORT' = 'BIST-KYD Altin'
        'KARTL' = 'BIST-KYD 1 Aylik Kar Payi TL'
        'XUTEK' = 'BIST Teknoloji'
        'XBLSM' = 'BIST Bilisim'
        'XELKT' = 'BIST Elektrik'
        'TKISA' = 'BIST-KYD Kamu Ic Borclanma Kisa Vade'
        'REPBR' = 'BIST-KYD O/N Repo Brut'
        'EUSTL' = 'BIST-KYD Kamu Eurobond USD (TL)'
        'MEVUS' = 'BIST-KYD 1 Aylik Mevduat USD (TL)'
        'REPNT' = 'BIST-KYD Repo Net'
        'XTM25' = 'BIST Temettu 25'
        'XGIDA' = 'BIST Gida Icecek'
    }
    'getiri' = @{
        'XU100_CFNNTLTL' = 'BIST-100 Getiri Endeksi'
        'XU030_CFNNTLTL' = 'BIST-30 Getiri Endeksi'
        'XUTEK_CFNNTLTL' = 'BIST Teknoloji Getiri Endeksi'
        'XBLSM_CFNNTLTL' = 'BIST Bilisim Getiri Endeksi'
        'XELKT_CFNNTLTL' = 'BIST Elektrik Getiri Endeksi'
        'XGIDA_CFNNTLTL' = 'BIST Gida Icecek Getiri Endeksi'
        'XTM25_CFNNTLTL' = 'BIST Temettu 25 Getiri Endeksi'
    }
}
$names = $namesByBatch[$Batch]
Write-Host "Batch: $Batch ($($names.Count) sembol)"

Write-Host "Reading cache: $CachePath"
$cache = Get-Content -Raw -Path $CachePath | ConvertFrom-Json

$epoch = Get-Date -Year 1899 -Month 12 -Day 29

$rows = New-Object System.Collections.Generic.List[object]
foreach ($code in $names.Keys) {
    $series = $cache.$code
    if (-not $series) { Write-Host "WARNING: no cached data for $code"; continue }
    foreach ($pt in $series) {
        $d = [datetime]::ParseExact($pt.date, 'yyyy-MM-dd', $null)
        $serial = ($d - $epoch).Days
        $rows.Add(@($code, $names[$code], [double]$serial, [double]$pt.value))
    }
}

$rowCount = $rows.Count
Write-Host "Total rows to append: $rowCount"
if ($rowCount -eq 0) { throw "No rows to append - aborting." }

Write-Host "Opening Excel COM..."
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

try {
    $wb = $excel.Workbooks.Open($XlsxPath)
    $ws = $wb.Sheets.Item("Bench_Sabit_Arsiv")

    $xlUp = -4162
    $lastRow = $ws.Cells.Item($ws.Rows.Count, 1).End($xlUp).Row
    Write-Host "Last used row before append: $lastRow"

    $startRow = $lastRow + 1
    $numCols = 4

    Write-Host "Building array..."
    $arr = New-Object 'object[,]' $rowCount, $numCols
    for ($i = 0; $i -lt $rowCount; $i++) {
        $r = $rows[$i]
        $arr[$i, 0] = $r[0]
        $arr[$i, 1] = $r[1]
        $arr[$i, 2] = $r[2]
        $arr[$i, 3] = $r[3]
    }

    $endRow = $startRow + $rowCount - 1
    Write-Host "Writing rows $startRow to $endRow..."
    $range = $ws.Range($ws.Cells.Item($startRow, 1), $ws.Cells.Item($endRow, $numCols))
    $range.Value2 = $arr

    $dateRange = $ws.Range($ws.Cells.Item($startRow, 3), $ws.Cells.Item($endRow, 3))
    $dateRange.NumberFormat = "yyyy-mm-dd"

    Write-Host "Saving..."
    $wb.Save()

    $newLastRow = $ws.Cells.Item($ws.Rows.Count, 1).End($xlUp).Row
    Write-Host "Last used row after append: $newLastRow"

    $wb.Close($true)
}
finally {
    $excel.Quit()
    if ($ws) { [System.Runtime.Interopservices.Marshal]::ReleaseComObject($ws) | Out-Null }
    if ($wb) { [System.Runtime.Interopservices.Marshal]::ReleaseComObject($wb) | Out-Null }
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}

Write-Host "Done."
