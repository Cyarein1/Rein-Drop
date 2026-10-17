// Hand-made, server-rendered charts (no chart library): bars, columns over time, stat tiles.
// Every mark is a link or a native pop-up (Popover API), so Analytics stays numbers + charts and
// the details live where they belong (decision 0021).
export { BarList, type BarDatum } from "./BarList";
export { ColumnChart, type ColumnBucket, type ColumnSeries } from "./ColumnChart";
export { KpiTiles, type Basis, type Kpi } from "./KpiTile";
export { type MarkAction, type MarkDetail, type MarkTone } from "./Mark";
export { PeriodTabs, readPeriod, withPeriod } from "./PeriodTabs";
export { compactCount, compactMoney } from "./scale";
