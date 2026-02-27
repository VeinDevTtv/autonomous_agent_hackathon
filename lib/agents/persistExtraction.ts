import { getNeo4jDriver } from "../neo4j/neo4jClient";
import type { ExtractionAgentOutput } from "./types";

/**
 * Persist extracted entities to Neo4j graph database.
 * Uses MERGE to prevent duplicate nodes (per unique constraints).
 * Gracefully skips if Neo4j is unavailable.
 */
export async function persistExtractionToNeo4j(
    extraction: ExtractionAgentOutput,
    jobId: string,
): Promise<void> {
    const driver = getNeo4jDriver();
    if (!driver) {
        console.warn("[neo4j] Driver not available — skipping graph persistence");
        return;
    }

    const session = driver.session();
    try {
        // --- Vendors ---
        for (const vendor of extraction.vendors) {
            await session.run(
                `MERGE (v:Vendor {name: $name})
         ON CREATE SET v.id = $id, v.address = $address, v.contactEmail = $contactEmail, v.createdAt = datetime()
         ON MATCH SET v.address = COALESCE($address, v.address), v.contactEmail = COALESCE($contactEmail, v.contactEmail)`,
                {
                    id: vendor.id,
                    name: vendor.name,
                    address: vendor.address ?? null,
                    contactEmail: vendor.contactEmail ?? null,
                },
            );
        }

        // --- Invoices ---
        for (const invoice of extraction.invoices) {
            await session.run(
                `MERGE (i:Invoice {id: $id})
         ON CREATE SET i.number = $number, i.amount = $amount, i.currency = $currency,
                       i.date = $date, i.dueDate = $dueDate, i.description = $description,
                       i.vendorName = $vendorName, i.createdAt = datetime()`,
                {
                    id: invoice.id,
                    number: invoice.number,
                    vendorName: invoice.vendorName,
                    amount: invoice.amount,
                    currency: invoice.currency,
                    date: invoice.date,
                    dueDate: invoice.dueDate ?? null,
                    description: invoice.description ?? null,
                },
            );

            // Link invoice to vendor
            await session.run(
                `MATCH (v:Vendor {name: $vendorName})
         MATCH (i:Invoice {id: $invoiceId})
         MERGE (i)-[:INVOICE_FROM_VENDOR]->(v)`,
                { vendorName: invoice.vendorName, invoiceId: invoice.id },
            );
        }

        // --- Contracts ---
        for (const contract of extraction.contracts) {
            await session.run(
                `MERGE (c:Contract {id: $id})
         ON CREATE SET c.title = $title, c.parties = $parties,
                       c.effectiveDate = $effectiveDate, c.expirationDate = $expirationDate,
                       c.value = $value, c.createdAt = datetime()`,
                {
                    id: contract.id,
                    title: contract.title,
                    parties: contract.parties,
                    effectiveDate: contract.effectiveDate ?? null,
                    expirationDate: contract.expirationDate ?? null,
                    value: contract.value ?? null,
                },
            );

            // Link contract to vendors by party name
            for (const party of contract.parties) {
                await session.run(
                    `MATCH (v:Vendor {name: $party})
           MATCH (c:Contract {id: $contractId})
           MERGE (c)-[:CONTRACT_WITH_VENDOR]->(v)`,
                    { party, contractId: contract.id },
                );
            }
        }

        // --- Clauses ---
        for (const clause of extraction.clauses) {
            await session.run(
                `MERGE (cl:Clause {id: $id})
         ON CREATE SET cl.type = $type, cl.text = $text, cl.contractId = $contractId, cl.createdAt = datetime()`,
                {
                    id: clause.id,
                    type: clause.type,
                    text: clause.text,
                    contractId: clause.contractId ?? null,
                },
            );

            // Link clause to contract if contractId matches
            if (clause.contractId) {
                await session.run(
                    `MATCH (c:Contract {id: $contractId})
           MATCH (cl:Clause {id: $clauseId})
           MERGE (c)-[:HAS_CLAUSE]->(cl)`,
                    { contractId: clause.contractId, clauseId: clause.id },
                );
            }
        }

        // --- Amounts ---
        for (const amount of extraction.amounts) {
            await session.run(
                `MERGE (a:Amount {id: $id})
         ON CREATE SET a.value = $value, a.currency = $currency, a.context = $context,
                       a.sourceEntityId = $sourceEntityId, a.createdAt = datetime()`,
                {
                    id: amount.id,
                    value: amount.value,
                    currency: amount.currency,
                    context: amount.context,
                    sourceEntityId: amount.sourceEntityId ?? null,
                },
            );
        }

        console.log(`[neo4j] Persisted entities for job ${jobId}`);
    } catch (error) {
        console.error("[neo4j] Failed to persist extraction:", error);
        throw error;
    } finally {
        await session.close();
    }
}
