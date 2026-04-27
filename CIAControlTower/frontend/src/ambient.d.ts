declare module '@airtable/blocks/interface/ui' {
    import type {ReactNode} from 'react';

    export interface AirtableField {
        id: string;
        name: string;
        type: string;
    }
    export interface AirtableTable {
        id: string;
        name: string;
        fields: ReadonlyArray<AirtableField>;
        getRecordByIdIfExists?(id: string): unknown;
    }
    export interface AirtableBase {
        getTableByNameIfExists(name: string): AirtableTable | null;
    }

    export function useBase(): AirtableBase;
    export function useRecords(
        table: AirtableTable | null,
        opts?: {fields?: ReadonlyArray<string>},
    ): ReadonlyArray<{
        id: string;
        getCellValue(name: string): unknown;
        getCellValueAsString(name: string): string;
    }> | null;
    export function expandRecord(record: unknown): void;
    export function initializeBlock(config: {interface: () => ReactNode}): void;
}
