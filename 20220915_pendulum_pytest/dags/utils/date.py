import pendulum
from pendulum import DateTime


def last_range(_dt: DateTime) -> str:
    dt = _dt.in_tz(pendulum.UTC)
    if dt.day_of_week < pendulum.WEDNESDAY:
        # pendulumのデフォルトでは週は月曜日始まり, `pendulum._WEEK_STARTS_AT`
        st = dt.subtract(days=2).start_of("week")
    else:
        st = dt.start_of("week")
    return f"{st.strftime('%Y-%m-%d')} AND {st.add(days=1).strftime('%Y-%m-%d')}"
