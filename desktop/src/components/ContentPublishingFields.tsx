import { Pin } from 'lucide-react';
import { contentVisibilityFor, type DocumentStateInput } from '../lib/contentVisibility';
import type { ContentKind } from '../types';
import { Select } from './ds/Select';

type ContentPublishingFieldsProps = {
  kind: ContentKind;
  value: DocumentStateInput;
  disabled?: boolean;
  onChange: (value: DocumentStateInput) => void;
};

type StateOption = {
  value: string;
  label: string;
};

const uniqueOptions = (options: StateOption[]) => options.filter((option, index) => (
  options.findIndex((candidate) => candidate.value === option.value) === index
));

export function ContentPublishingFields({
  kind,
  value,
  disabled = false,
  onChange,
}: ContentPublishingFieldsProps) {
  const lifecycle = contentVisibilityFor(value.visibility);
  const visibilityOptions = uniqueOptions([
    { value: lifecycle.visibility, label: lifecycle.visibilityLabel },
    ...lifecycle.actions
      .filter((action) => action.group === 'visibility')
      .map((action) => ({
        value: action.nextState.visibility,
        label: contentVisibilityFor(action.nextState.visibility).visibilityLabel,
      })),
  ]);

  return (
    <div className="content-publishing-fields">
      <div className="content-settings-control">
        <span>Visibility</span>
        <Select
          aria-label="Content visibility"
          value={value.visibility}
          disabled={disabled || visibilityOptions.length === 1}
          onChange={(event) => onChange({ ...value, visibility: event.target.value })}
        >
          {visibilityOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
      </div>

      {kind === 'moment' && (
        <label className="content-publishing-pin">
          <input
            type="checkbox"
            checked={Boolean(value.pinned)}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, pinned: event.target.checked })}
          />
          <span className="content-publishing-switch" aria-hidden="true"><i /></span>
          <span className="content-publishing-pin-copy">
            <strong><Pin size={14} aria-hidden="true" /> Pin to top</strong>
          </span>
        </label>
      )}
    </div>
  );
}
