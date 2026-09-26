const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not configured.");
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false
});

app.get("/", (req, res) => {
    res.json({
        ok: true,
        service: "Law Students Union API",
        status: "running"
    });
});

app.get("/health", async (req, res) => {
    try {
        await pool.query("SELECT 1");

        res.json({
            ok: true,
            database: "connected"
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            ok: false,
            database: "disconnected"
        });
    }
});

app.get("/api/test", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT NOW() AS time"
        );

        res.json({
            ok: true,
            message: "API and database are working.",
            time: result.rows[0].time
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            ok: false,
            message: "Database connection failed."
        });
    }
});

app.get("/api/tables", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        `);

        res.json({
            ok: true,
            tables: result.rows.map(row => row.table_name)
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            ok: false,
            message: "Could not read database tables."
        });
    }
});

async function initializeDatabase() {
    try {
        const schemaPath = path.join(__dirname, "schema.sql");

        const schema = fs.readFileSync(
            schemaPath,
            "utf8"
        );

        await pool.query(schema);

        console.log("Database schema initialized successfully.");
    } catch (error) {
        console.error("Database initialization failed:");
        console.error(error);
        process.exit(1);
    }
}

async function startServer() {
    await initializeDatabase();

    app.listen(PORT, "0.0.0.0", () => {
        console.log(
            `Law Students Union API running on port ${PORT}`
        );
    });
}

startServer();
