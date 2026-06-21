import type { FormEvent } from "react";
import { MIN_PASSWORD_LENGTH } from "@ecoplatform/shared";
import { PLATFORM_ROLE_SHORT_LABELS } from "../../../lib/display-labels";
import { allStaffRoles, genderOptions } from "./constants";
import type { CreateStaffForm as CreateStaffFormState } from "./types";

type CreateStaffFormProps = {
  form: CreateStaffFormState;
  onChange: (form: CreateStaffFormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function CreateStaffForm({ form, onChange, onSubmit }: CreateStaffFormProps) {
  return (
    <form className="form" onSubmit={onSubmit}>
      <input
        className="input"
        onChange={(event) => onChange({ ...form, email: event.target.value })}
        placeholder="email"
        required
        type="email"
        value={form.email}
      />
      <input
        className="input"
        onChange={(event) => onChange({ ...form, phone: event.target.value })}
        placeholder="+79991234567"
        required
        value={form.phone}
      />
      <input
        className="input"
        onChange={(event) => onChange({ ...form, firstName: event.target.value })}
        placeholder="Имя"
        required
        value={form.firstName}
      />
      <input
        className="input"
        onChange={(event) => onChange({ ...form, lastName: event.target.value })}
        placeholder="Фамилия"
        required
        value={form.lastName}
      />
      <label className="field-label">
        Пол
        <select
          className="select"
          onChange={(event) => onChange({ ...form, gender: event.target.value as CreateStaffFormState["gender"] })}
          value={form.gender}
        >
          {genderOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <input
        aria-label="Временный пароль"
        autoComplete="new-password"
        className="input"
        minLength={MIN_PASSWORD_LENGTH}
        onChange={(event) => onChange({ ...form, password: event.target.value })}
        placeholder={`Временный пароль (>= ${MIN_PASSWORD_LENGTH} символов)`}
        required
        type="password"
        value={form.password}
      />
      <div className="form-actions">
        {allStaffRoles.map((role) => (
          <label className="checklist-item" key={role}>
            <input
              checked={form.roles.includes(role)}
              onChange={(event) =>
                onChange({
                  ...form,
                  roles: event.target.checked ? [...form.roles, role] : form.roles.filter((item) => item !== role),
                })
              }
              type="checkbox"
            />
            {PLATFORM_ROLE_SHORT_LABELS[role]}
          </label>
        ))}
      </div>
      <button className="button" type="submit">
        Создать сотрудника
      </button>
    </form>
  );
}
