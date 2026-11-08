# Weekly fuel-price fixture

`weekly.csv` is a small dated fixture based on the public DESNZ column layout
and the 19 October, 26 October and 2 November 2026 observations shown in the
[GOV.UK weekly road fuel price publication](https://www.gov.uk/government/statistics/weekly-road-fuel-prices)
and its [3 November 2026 CSV preview](https://www.gov.uk/csv-preview/6aa801e097b321a2d34ee250/CSV__2018_-__.csv).

Contains public sector information licensed under the Open Government Licence
v3.0, subject to the publication's stated exceptions. The rows are deliberately
out of date order to exercise latest-observation selection. Tests construct
malformed variants in memory. These historical values are never a runtime
fallback, bundled price update or source of current station prices.
