from pendulum import UTC, datetime

from dags.utils.date import last_range


def test_last_range():
    assert last_range(datetime(2022, 9, 17, 17, 0, 0, 0, UTC)) == "2022-09-12 AND 2022-09-13", "日本時間日曜日"
    assert last_range(datetime(2022, 9, 18, 17, 0, 0, 0, UTC)) == "2022-09-12 AND 2022-09-13", "日本時間月曜日"
    assert last_range(datetime(2022, 9, 19, 17, 0, 0, 0, UTC)) == "2022-09-12 AND 2022-09-13", "日本時間火曜日"
    assert last_range(datetime(2022, 9, 20, 17, 0, 0, 0, UTC)) == "2022-09-19 AND 2022-09-20", "日本時間水曜日"
    assert last_range(datetime(2022, 9, 21, 17, 0, 0, 0, UTC)) == "2022-09-19 AND 2022-09-20", "日本時間木曜日"
    assert last_range(datetime(2022, 9, 22, 17, 0, 0, 0, UTC)) == "2022-09-19 AND 2022-09-20", "日本時間金曜日"
    assert last_range(datetime(2022, 9, 23, 17, 0, 0, 0, UTC)) == "2022-09-19 AND 2022-09-20", "日本時間土曜日"
