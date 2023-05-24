import pandas as pd
import matplotlib.pyplot as plt
from dateutil import tz
JST = tz.gettz('Asia/Tokyo')

data = pd.read_csv('data.txt', header=None, names=['datetime_str'])

data['datetime'] = pd.to_datetime(data['datetime_str']).apply(lambda x: x.astimezone(JST))

data['hour'] = data['datetime'].dt.hour
data['minute'] = data['datetime'].dt.minute
data['second'] = data['datetime'].dt.second

plt.scatter(data['datetime'].dt.date, data['hour'] + data['minute'] / 60. + data['second'] / 3600., s=15, alpha=0.5)

plt.grid(axis='y')

plt.xlabel('Date')
plt.ylabel('Time (seconds)')

plt.show()

plt.savefig('scatter_plot.png')
