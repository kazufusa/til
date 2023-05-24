## plot git activity

```sh
git log --format=format:'%aI'  --abbrev-commit  --date=iso-local --date-order >| data.txt
python png.py
open ./scatter_plot.png
```
