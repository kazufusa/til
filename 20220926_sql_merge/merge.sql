MERGE INTO existing e
USING new n
  ON n.id = e.id AND n.sub_id = e.sub_id AND n.date = e.date
WHEN MATCHED THEN
  UPDATE SET
    e.value1 = n.value1,
    e.value2 = n.value2,
    e.value3 = n.value3
WHEN NOT MATCHED BY TARGET THEN
  INSERT (id, sub_id, date, value1, value2, value3)
  VALUES(n.id, n.sub_id, n.date, n.value1, n.value2, n.value3)
WHEN NOT MATCHED BY SOURCE AND e.date = '2022-09-01' THEN
  DELETE
;
