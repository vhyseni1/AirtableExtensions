const BATCH = 50;

export async function truncateResults(table) {
    const query = await table.selectRecordsAsync({fields: []});
    const ids = query.records.map(r => r.id);
    query.unloadData();
    for (let i = 0; i < ids.length; i += BATCH) {
        await table.deleteRecordsAsync(ids.slice(i, i + BATCH));
    }
    return ids.length;
}

export async function writeResults(table, records) {
    let written = 0;
    for (let i = 0; i < records.length; i += BATCH) {
        const batch = records.slice(i, i + BATCH).map(fields => ({fields}));
        await table.createRecordsAsync(batch);
        written += batch.length;
    }
    return written;
}
