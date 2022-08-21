from google.cloud import bigquery

with open("./test.sql", "r") as f:
    query = f.read()

client = bigquery.Client()

query_job = client.query(query)

for row in query_job:
    print(row)
    print(f"{row['data'].get('data_a')}")
    print(f"{row['data'].get('data_b')}")
    print(f"{row['data'].get('data_c')}")
    print(f"{row['data'].get('data_d')}")
