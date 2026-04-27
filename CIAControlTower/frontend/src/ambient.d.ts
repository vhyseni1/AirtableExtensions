declare module '@airtable/blocks/interface/ui' {
    import type {CSSProperties, ReactElement, ReactNode} from 'react';

    export interface AirtableField {
        id: string;
        name: string;
        type: string;
    }
    export interface AirtableRecord {
        id: string;
        getCellValue(name: string): unknown;
        getCellValueAsString(name: string): string;
    }
    export interface AirtableTable {
        id: string;
        name: string;
        fields: ReadonlyArray<AirtableField>;
    }
    export interface AirtableBase {
        getTableByNameIfExists(name: string): AirtableTable | null;
    }

    export function useBase(): AirtableBase;
    export function useRecords(table: AirtableTable | null): AirtableRecord[] | null;
    export function expandRecord(record: AirtableRecord): void;
    export function initializeBlock(config: {interface: () => ReactNode}): void;

    export interface CellRendererProps {
        record?: AirtableRecord | null;
        cellValue?: unknown;
        field: AirtableField;
        shouldWrap?: boolean;
        className?: string;
        style?: CSSProperties;
        cellClassName?: string;
        cellStyle?: CSSProperties;
        renderInvalidCellValue?: (cellValue: unknown, field: AirtableField) => ReactElement;
    }
    export function CellRenderer(props: CellRendererProps): ReactElement;
}
