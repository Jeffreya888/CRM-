import * as Linking from 'expo-linking';
import { CrudList } from '../../components/CrudList';
import { Badge, IconButton, ListRow, Row } from '../../components/ui';
import { canEdit } from '../../lib/plans';
import { useOrg } from '../../lib/session';
import type { Location } from '../../lib/types';

export default function Locations() {
  const { role } = useOrg();
  return (
    <CrudList<Location>
      title="Airports & FBOs"
      table="locations"
      order={[{ column: 'airport_code' }, { column: 'name' }]}
      emptyIcon="location-outline"
      emptyTitle="No locations yet"
      emptyBody="Save the airports, FBOs and hangars you work at with gate codes and water/power notes."
      canWrite={canEdit(role)}
      searchKeys={(l) => [l.name, l.airport_code, l.fbo_name]}
      defaults={{ has_water: true, has_power: true, hangar_available: false }}
      toRow={(v) => ({ ...v, airport_code: v.airport_code ? String(v.airport_code).toUpperCase() : null })}
      fields={[
        { key: 'airport_code', label: 'Airport code', type: 'text', placeholder: 'KTEB' },
        { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Teterboro' },
        { key: 'fbo_name', label: 'FBO / hangar', type: 'text', placeholder: 'Signature, Atlantic, Million Air…' },
        { key: 'address', label: 'Address', type: 'multiline' },
        { key: 'contact_phone', label: 'FBO phone', type: 'phone' },
        { key: 'access_notes', label: 'Access notes', type: 'multiline', placeholder: 'Gate code, badge escort, where to park the van' },
        { key: 'has_water', label: 'Water available', type: 'toggle' },
        { key: 'has_power', label: 'Power available', type: 'toggle' },
        { key: 'hangar_available', label: 'Hangar space available', type: 'toggle' },
      ]}
      renderRow={(l, edit) => (
        <ListRow icon="location-outline" title={[l.airport_code, l.name].filter(Boolean).join(' · ')} subtitle={l.fbo_name} meta={l.access_notes}
          right={<Row gap={4}>{!l.has_water ? <Badge label="No water" tone="warning" /> : null}{l.contact_phone ? <IconButton icon="call-outline" onPress={() => Linking.openURL(`tel:${l.contact_phone}`)} /> : null}</Row>}
          onPress={edit} />
      )}
    />
  );
}
