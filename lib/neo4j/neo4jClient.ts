import neo4j, { type Driver } from "neo4j-driver";

let driver: Driver | null = null;

/**
 * Returns a Neo4j driver singleton, or null if credentials are not configured.
 * The driver is lazy-initialized on first call.
 */
export function getNeo4jDriver(): Driver | null {
    const uri = process.env.NEO4J_URI;
    const user = process.env.NEO4J_USERNAME;
    const password = process.env.NEO4J_PASSWORD;

    if (!uri || !user || !password || uri === "bolt://your-neo4j-host:7687") {
        return null;
    }

    if (!driver) {
        driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
        console.log("[neo4j] Driver created for", uri);
    }

    return driver;
}

/**
 * Close the Neo4j driver (call on shutdown).
 */
export async function closeNeo4jDriver(): Promise<void> {
    if (driver) {
        await driver.close();
        driver = null;
    }
}
