import { getNeo4jDriver } from "./neo4jClient";

/**
 * Create unique constraints on all entity node types.
 * Safe to call multiple times (CREATE CONSTRAINT IF NOT EXISTS).
 */
export async function setupNeo4jSchema(): Promise<void> {
    const driver = getNeo4jDriver();
    if (!driver) {
        console.warn("[neo4j] Driver not available — skipping schema setup");
        return;
    }

    const session = driver.session();
    try {
        const constraints = [
            "CREATE CONSTRAINT vendor_id IF NOT EXISTS FOR (v:Vendor) REQUIRE v.id IS UNIQUE",
            "CREATE CONSTRAINT invoice_id IF NOT EXISTS FOR (i:Invoice) REQUIRE i.id IS UNIQUE",
            "CREATE CONSTRAINT contract_id IF NOT EXISTS FOR (c:Contract) REQUIRE c.id IS UNIQUE",
            "CREATE CONSTRAINT clause_id IF NOT EXISTS FOR (cl:Clause) REQUIRE cl.id IS UNIQUE",
            "CREATE CONSTRAINT amount_id IF NOT EXISTS FOR (a:Amount) REQUIRE a.id IS UNIQUE",
        ];

        for (const query of constraints) {
            await session.run(query);
        }

        console.log("[neo4j] Schema constraints created/verified");
    } catch (error) {
        console.error("[neo4j] Schema setup failed:", error);
    } finally {
        await session.close();
    }
}
