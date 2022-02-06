select * from Address;
select
  name,
  gender,
  age,
  Rank() over(partition by gender order by age desc) as rnk
from Address;
