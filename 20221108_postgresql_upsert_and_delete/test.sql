WITH candidates AS (
    SELECT
        UUID,
    FROM report
    WHERE
        date = DATE_SUB(DATE '{ date_interval_end | local_ds }', INTERVAL 1 DAY)
        AND SUM(imp) > 0
    GROUP BY UUID
), daily_reports AS (
    SELECT
        UUID,
        SUM(imp) AS imp,
        date,
        category,
        SUM(IF(imp > 0, 1, 0)) AS num_date,
    FROM report
        INNER JOIN candidates USING (UUID)
    WHERE
        date BETWEEN '2022-11-01' AND '2022-11-11'
    GROUP BY UUID, date
), evaluations AS (
    SELECT
        dr.*
        RANK() OVER (PARTITION BY category ORDER BY imp, UUID DESC) AS rank_from_top_to_bottom,
        RANK() OVER (PARTITION BY category ORDER BY imp) AS rank_from_bottom_to_top,
    FROM daily_reports dr
)
SELECT
    ev.*
    CASE
        WHEN ev.rank_from_top_to_bottom = 1 THEN "BEST"
        WHEN ev.rank_from_bottom_to_top <= 3 THEN "BAD"
        ELSE ""
    END AS evaluation
FROM evaluations
