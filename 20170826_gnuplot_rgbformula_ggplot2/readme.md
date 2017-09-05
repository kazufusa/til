# Rgbformulae in ggplot2

## Rgbformulae

http://gnuplot.sourceforge.net/docs_4.2/node216.html

http://slpr.sakura.ne.jp/qp/pm3d-colormap/

```gnuplot
set palette rgbformulae 33,13,10
```

```
$ gnuplot -e "show palette rgbformulae"
	  * there are 37 available rgb color mapping formulae:
	     0: 0               1: 0.5             2: 1              
	     3: x               4: x^2             5: x^3            
	     6: x^4             7: sqrt(x)         8: sqrt(sqrt(x))  
	     9: sin(90x)       10: cos(90x)       11: |x-0.5|        
	    12: (2x-1)^2       13: sin(180x)      14: |cos(180x)|    
	    15: sin(360x)      16: cos(360x)      17: |sin(360x)|    
	    18: |cos(360x)|    19: |sin(720x)|    20: |cos(720x)|    
	    21: 3x             22: 3x-1           23: 3x-2           
	    24: |3x-1|         25: |3x-2|         26: (3x-1)/2       
	    27: (3x-2)/2       28: |(3x-1)/2|     29: |(3x-2)/2|     
	    30: x/0.32-0.78125 31: 2*x-0.84       32: 4x;1;-2x+1.84;x/0.08-11.5
	    33: |2*x - 0.5|    34: 2*x            35: 2*x - 0.5      
	    36: 2*x - 1        
	  * negative numbers mean inverted=negative colour component
	  * thus the ranges in `set pm3d rgbformulae' are -36..36
```

x = [0, 1]
R/G/B = function(x) * 255
