import React, {useState} from 'react';
import {Box, Heading, Switch, Text, Icon} from '@airtable/blocks/ui';

export default function RulesPanel({table, records, disabled}) {
    const [open, setOpen] = useState(false);

    if (!records) return null;

    const activeCount = records.filter(
        r => r.getCellValueAsString('Active') === 'Yes',
    ).length;

    async function toggle(record, on) {
        await table.updateRecordAsync(record, {
            Active: {name: on ? 'Yes' : 'No'},
        });
    }

    return (
        <Box marginBottom={3}>
            <Box
                display="flex"
                alignItems="center"
                style={{cursor: 'pointer'}}
                onClick={() => setOpen(!open)}
            >
                <Icon name={open ? 'chevronDown' : 'chevronRight'} size={16} />
                <Heading size="small" marginLeft={1}>
                    Active rules ({activeCount}/{records.length})
                </Heading>
            </Box>

            {open && (
                <Box marginTop={2} paddingLeft={2}>
                    {records.map(record => {
                        const id = record.getCellValueAsString('Rule_ID');
                        const name = record.getCellValueAsString('Rule_Name');
                        const severity = record.getCellValueAsString('Severity');
                        const isOn = record.getCellValueAsString('Active') === 'Yes';
                        return (
                            <Box
                                key={record.id}
                                display="flex"
                                alignItems="center"
                                marginBottom={1}
                            >
                                <Switch
                                    value={isOn}
                                    onChange={v => toggle(record, v)}
                                    disabled={disabled}
                                    label=""
                                    width="auto"
                                />
                                <Text marginLeft={2} flex="1">
                                    <strong>{id}</strong> — {name}
                                </Text>
                                <Text textColor="light">{severity}</Text>
                            </Box>
                        );
                    })}
                </Box>
            )}
        </Box>
    );
}
