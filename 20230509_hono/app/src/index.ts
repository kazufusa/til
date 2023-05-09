import { serve } from '@hono/node-server'
import { Hono } from 'hono'

const app = new Hono()
app.post('/test', async (c) => {
  const {name, age} = await c.req.json()
  c.header('Content-Type', 'application/json')
  return c.json({text: `Hello ${name}(${age})!`})
})

serve({fetch: app.fetch, port: 8081})
