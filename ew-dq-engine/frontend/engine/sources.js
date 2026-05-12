const FIELDS = {
    EPP: [
        'Worker_ID', 'Legal_First_Name', 'Legal_Last_Name', 'Supplier_ID', 'Category',
        'Self_Employed', 'RRP_ID', 'Roche_Country', 'Company_Code', 'Cost_Center',
        'Start_Date', 'End_Date', 'FTE', 'Country_of_Residence', 'Capability',
        'PO_Number', 'Status', 'Work_Location',
    ],
    Fieldglass: ['Worker_ID', 'Supplier_ID', 'Category', 'Cost_Center', 'Status'],
    PurchaseOrders: ['PO_Number', 'Supplier_ID', 'PO_Start_Date', 'PO_End_Date'],
    Spend: ['PO_Number', 'Supplier_ID', 'Worker_ID'],
    Valid_Cost_Centers: ['Cost_Center'],
};

function extract(record, fieldNames) {
    const out = {_recordId: record.id};
    for (const f of fieldNames) {
        const v = record.getCellValue(f);
        if (v && typeof v === 'object' && 'name' in v) {
            out[f] = v.name;
        } else {
            out[f] = v;
        }
    }
    return out;
}

export async function loadSources(base) {
    const result = {};
    for (const [name, fields] of Object.entries(FIELDS)) {
        const table = base.getTableByNameIfExists(name);
        if (!table) {
            throw new Error(`Required table not found: ${name}`);
        }
        const query = await table.selectRecordsAsync({fields});
        result[name] = query.records.map(r => extract(r, fields));
        query.unloadData();
    }
    return {
        epp: result.EPP,
        fg: result.Fieldglass,
        po: result.PurchaseOrders,
        spend: result.Spend,
        validCC: new Set(result.Valid_Cost_Centers.map(r => r.Cost_Center).filter(Boolean)),
    };
}
