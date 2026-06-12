// Role Display Mapping Utility
// Maps internal database role values to user-facing display labels.
// The database stores 'Plantonista', 'Responsavel', 'Adm' but the UI
// displays 'Command', 'Responsável', 'Admin' respectively.

/**
 * Maps internal role values to their display labels.
 */
const ROLE_DISPLAY_MAP: Record<string, string> = {
  'Plantonista': 'Command',
  'Responsavel': 'Responsável',
  'Adm': 'Admin',
};

/**
 * Maps an internal perfil value to its user-facing display label.
 * Returns the original value unchanged if no mapping exists.
 */
export function mapRoleLabel(perfil: string): string {
  return ROLE_DISPLAY_MAP[perfil] || perfil;
}

/**
 * Maps a display label back to its internal database value.
 * Returns the original label unchanged if no reverse mapping exists.
 */
export function mapDisplayToInternal(displayLabel: string): string {
  const entry = Object.entries(ROLE_DISPLAY_MAP).find(([_, v]) => v === displayLabel);
  return entry ? entry[0] : displayLabel;
}

/**
 * Formats a user object for display as "{nome} ({mappedPerfil})".
 * The codigo field is intentionally excluded from the output.
 */
export function formatUserDisplay(user: { nome: string; perfil: string }): string {
  return `${user.nome} (${mapRoleLabel(user.perfil)})`;
}
