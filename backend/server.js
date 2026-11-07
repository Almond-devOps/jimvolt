require('dotenv').config()

const cors = require('cors')
const express = require('express')
const http = require('node:http')
const path = require('node:path')
const { pool, connectDB, ensureCoreSchema } = require('./config/database')
const adRoutes = require('./routes/adRoutes')
const adminRoutes = require('./routes/adminRoutes')
const authRoutes = require('./routes/authRoutes')
const categoryRoutes = require('./routes/categoryRoutes')
const messageRoutes = require('./routes/messageRoutes')
const userRoutes = require('./routes/userRoutes')
const sellerRoutes = require('./routes/sellerRoutes')
const reportRoutes = require('./routes/reportRoutes')
const discoveryRoutes = require('./routes/discoveryRoutes')
const { router: seoRouter } = require('./routes/seoRoutes')
const bachsTestRoutes = require('./routes/bachsTestRoutes')
const { ensureInitialCategories } = require('./models/categoryModel')
const { errorHandler, notFound } = require('./middleware/errorMiddleware')
const { createSocketServer } = require('./socket')

const app = express()
let initialization
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
    return callback(new Error('This origin is not allowed by the CORS policy.'))
  },
}))
app.use((req, res, next) => {
  initializeBackend().then(() => next(), next)
})
app.use(express.json({ limit: '1mb' }))
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { dotfiles: 'deny', maxAge: '1d' }))
app.use(express.static(path.resolve(__dirname, '../frontend/dist'), { index: false, maxAge: '1h' }))

app.get('/', (req, res) => res.json({ message: 'Jimvolt API is running successfully.' }))
app.get('/api/health', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT DATABASE() AS database_name')
    return res.json({ status: 'ok', database: rows[0].database_name })
  } catch (error) {
    return next(error)
  }
})
app.get('/api/test-db', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT DATABASE() AS database_name')
    return res.json({ success: true, database: rows[0].database_name })
  } catch (error) {
    return next(error)
  }
})

app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/seller', sellerRoutes)
app.use('/api/reports', reportRoutes)
app.use('/api/ads', adRoutes)
app.use('/api/categories', categoryRoutes)
app.use('/api/messages', messageRoutes)
app.use('/api/favorites', discoveryRoutes.favorites)
app.use('/api/recently-viewed', discoveryRoutes.recentlyViewed)
app.use('/api/admin', adminRoutes)
app.use('/api/tests/bachs', bachsTestRoutes)
app.use('/', seoRouter)
app.use(notFound)
app.use(errorHandler)

function initializeBackend() {
  if (!initialization) {
    initialization = (async () => {
      if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        throw new Error('Set JWT_SECRET to a random secret of at least 32 characters.')
      }

      await connectDB()
      await ensureCoreSchema()
      await ensureInitialCategories()
    })().catch((error) => {
      initialization = undefined
      throw error
    })
  }
  return initialization
}

async function startServer({ port = Number(process.env.PORT || 5000), host } = {}) {
  await initializeBackend()

  const server = http.createServer(app)
  const io = createSocketServer(server, allowedOrigins)
  app.set('io', io)
  server.io = io

  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      const address = server.address()
      console.log(`Jimvolt API listening on port ${typeof address === 'object' ? address.port : port}`)
      resolve(server)
    })
    server.once('error', reject)
  })
}

if (require.main === module) {
  startServer()
    .then((server) => {
      let shuttingDown = false
      const shutdown = () => {
        if (shuttingDown) return
        shuttingDown = true
        io.close(async () => {
          await pool.end()
          process.exit(0)
        })
      }
      process.once('SIGINT', shutdown)
      process.once('SIGTERM', shutdown)
    })
    .catch(async (error) => {
      console.error('Server startup failed:', error.message)
      await pool.end()
      process.exit(1)
    })
}

module.exports = { app, initializeBackend, startServer }
