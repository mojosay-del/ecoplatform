import { useState } from "react";
import type { User } from "../../lib/auth";
import { AccountEditableValue } from "./shared";
import { ContactChangeDialog } from "./PersonalProfileContactDialog";
import { GenderEditDialog } from "./PersonalProfileGenderDialog";
import { NameEditDialog } from "./PersonalProfileNameDialog";
import type { ContactField } from "./personal-profile-options";
import { getGenderLabel } from "./personal-profile-options";

export function AccountNameValue({ onSaved, user }: { onSaved: () => Promise<void>; user: User | null }) {
  const [open, setOpen] = useState(false);
  const fullName = user ? `${user.firstName} ${user.lastName}` : null;

  return (
    <>
      <AccountEditableValue value={fullName} label="Имя и фамилия" onEdit={() => setOpen(true)} />
      {open && user ? <NameEditDialog onClose={() => setOpen(false)} onSaved={onSaved} user={user} /> : null}
    </>
  );
}

export function AccountGenderValue({ onSaved, value }: { onSaved: () => Promise<void>; value: User["gender"] | null }) {
  const currentValue = value ?? "";
  const [open, setOpen] = useState(false);

  return (
    <>
      <AccountEditableValue value={getGenderLabel(value)} label="Пол" onEdit={() => setOpen(true)} />
      {open ? <GenderEditDialog currentValue={currentValue} onClose={() => setOpen(false)} onSaved={onSaved} /> : null}
    </>
  );
}

export function AccountContactValue({
  field,
  label,
  onSaved,
  value,
}: {
  field: ContactField;
  label: string;
  onSaved: () => Promise<void>;
  value?: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <AccountEditableValue value={value} label={label} onEdit={() => setOpen(true)} />
      {open ? (
        <ContactChangeDialog
          currentValue={value ?? ""}
          field={field}
          onClose={() => setOpen(false)}
          onSaved={onSaved}
        />
      ) : null}
    </>
  );
}
