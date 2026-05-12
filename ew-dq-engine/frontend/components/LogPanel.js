import React, {useState} from 'react';
import {Box, Heading, Text, Icon} from '@airtable/blocks/ui';

export default function LogPanel({lines}) {
    const [open, setOpen] = useState(false);

    return (
        <Box>
            <Box
                display="flex"
                alignItems="center"
                style={{cursor: 'pointer'}}
                onClick={() => setOpen(!open)}
            >
                <Icon name={open ? 'chevronDown' : 'chevronRight'} size={16} />
                <Heading size="small" marginLeft={1}>
                    Log ({lines.length})
                </Heading>
            </Box>

            {open && (
                <Box
                    marginTop={2}
                    padding={2}
                    backgroundColor="lightGray1"
                    style={{
                        fontFamily: 'monospace',
                        fontSize: 12,
                        maxHeight: 320,
                        overflowY: 'auto',
                    }}
                >
                    {lines.length === 0 ? (
                        <Text textColor="light">No log entries yet.</Text>
                    ) : (
                        lines.map((line, i) => (
                            <Text key={i} style={{whiteSpace: 'pre-wrap'}}>{line}</Text>
                        ))
                    )}
                </Box>
            )}
        </Box>
    );
}
