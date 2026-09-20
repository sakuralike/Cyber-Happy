UPDATE "SiteSetting"
SET "value" = '[{"day":1,"type":"STAMP","name":"初竿","iconKey":"stamp_rod","milestone":false},{"day":3,"type":"STAMP","name":"常客","iconKey":"stamp_regular","milestone":false},{"day":7,"type":"MEDAL","name":"铜钩钓士","iconKey":"medal_bronze","milestone":true},{"day":14,"type":"MEDAL","name":"银钩钓士","iconKey":"medal_silver","milestone":true},{"day":21,"type":"MEDAL","name":"金钩钓士","iconKey":"medal_gold","milestone":true},{"day":28,"type":"TITLE","name":"钓神出勤","iconKey":"title_master","milestone":true}]'
WHERE "scope" = 'CHECKIN_REWARD'
  AND "key" = 'rewards'
  AND "value" = '[{"day":1,"type":"STAMP","name":"初竿","iconKey":"stamp_rod","milestone":false},{"day":3,"type":"STAMP","name":"常客","iconKey":"stamp_regular","milestone":false},{"day":7,"type":"MEDAL","name":"铜钩钓士","iconKey":"medal_bronze","milestone":true}]';

UPDATE "SiteSetting"
SET "draftValue" = '[{"day":1,"type":"STAMP","name":"初竿","iconKey":"stamp_rod","milestone":false},{"day":3,"type":"STAMP","name":"常客","iconKey":"stamp_regular","milestone":false},{"day":7,"type":"MEDAL","name":"铜钩钓士","iconKey":"medal_bronze","milestone":true},{"day":14,"type":"MEDAL","name":"银钩钓士","iconKey":"medal_silver","milestone":true},{"day":21,"type":"MEDAL","name":"金钩钓士","iconKey":"medal_gold","milestone":true},{"day":28,"type":"TITLE","name":"钓神出勤","iconKey":"title_master","milestone":true}]'
WHERE "scope" = 'CHECKIN_REWARD'
  AND "key" = 'rewards'
  AND "draftValue" = '[{"day":1,"type":"STAMP","name":"初竿","iconKey":"stamp_rod","milestone":false},{"day":3,"type":"STAMP","name":"常客","iconKey":"stamp_regular","milestone":false},{"day":7,"type":"MEDAL","name":"铜钩钓士","iconKey":"medal_bronze","milestone":true}]';

UPDATE "ConfigRevision"
SET "snapshotJson" = REPLACE(
  "snapshotJson",
  '"rewards":[{"day":1,"type":"STAMP","name":"初竿","iconKey":"stamp_rod","milestone":false},{"day":3,"type":"STAMP","name":"常客","iconKey":"stamp_regular","milestone":false},{"day":7,"type":"MEDAL","name":"铜钩钓士","iconKey":"medal_bronze","milestone":true}]',
  '"rewards":[{"day":1,"type":"STAMP","name":"初竿","iconKey":"stamp_rod","milestone":false},{"day":3,"type":"STAMP","name":"常客","iconKey":"stamp_regular","milestone":false},{"day":7,"type":"MEDAL","name":"铜钩钓士","iconKey":"medal_bronze","milestone":true},{"day":14,"type":"MEDAL","name":"银钩钓士","iconKey":"medal_silver","milestone":true},{"day":21,"type":"MEDAL","name":"金钩钓士","iconKey":"medal_gold","milestone":true},{"day":28,"type":"TITLE","name":"钓神出勤","iconKey":"title_master","milestone":true}]'
)
WHERE "status" = 'PUBLISHED'
  AND "snapshotJson" LIKE '%"rewards":[{"day":1,"type":"STAMP","name":"初竿","iconKey":"stamp_rod","milestone":false},{"day":3,"type":"STAMP","name":"常客","iconKey":"stamp_regular","milestone":false},{"day":7,"type":"MEDAL","name":"铜钩钓士","iconKey":"medal_bronze","milestone":true}]%';
