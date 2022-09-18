from pendulum import DateTime


def last_range(dt: DateTime) -> str:
    # pendulumのデフォルトでは週は月曜日始まり, `pendulum._WEEK_STARTS_AT`
    st = dt.in_tz("Asia/Tokyo").subtract(days=2).start_of("week")
    return f"{st.strftime('%Y-%m-%d')} AND {st.add(days=1).strftime('%Y-%m-%d')}"
