/**
 * Dashboard Fallback Service
 *
 * Resolves fallback contacts for a dashboard area when no plantonista
 * is currently scheduled (Requirements 5.1, 5.2).
 *
 * Fallback priority:
 *   1. All Command users (perfil = 'Plantonista') linked directly to the area
 *   2. If the area belongs to a torre, all Command users in ANY area of that torre
 */

import { UserRepository } from '../database/repositories/UserRepository';
import { AreaRepository } from '../database/repositories/AreaRepository';
import { User, Area } from '../../shared/types';

/** Represents a single fallback contact returned to the dashboard */
export interface FallbackContact {
  id: number;
  nome: string;
  cargo: string | null;
  areaCodigo: string;
  areaNome: string;
}

/** Result of the fallback resolution for one area */
export interface AreaFallbackResult {
  /** Area that was queried */
  areaCodigo: string;
  /** Torre that the area belongs to, or null */
  torre: string | null;
  /** Whether fallback was needed (no plantonista scheduled) */
  isFallback: boolean;
  /**
   * Fallback scope:
   * - 'area'  — contacts come from the area itself (Req 5.1)
   * - 'torre' — contacts come from all areas in the torre (Req 5.2)
   * - 'none'  — no fallback contacts found
   */
  fallbackScope: 'area' | 'torre' | 'none';
  /** Fallback contacts to display */
  contacts: FallbackContact[];
}

/**
 * Resolve fallback contacts for an area that has no plantonista scheduled today.
 *
 * The function first looks for Command users (perfil='Plantonista') in the given
 * area directly.  If none are found and the area belongs to a torre, it widens
 * the search to all areas within that torre.
 *
 * @param areaCodigo  - The area to look up
 * @param userRepo    - UserRepository instance
 * @param areaRepo    - AreaRepository instance
 * @returns           AreaFallbackResult describing the fallback contacts found
 */
export function resolveAreaFallback(
  areaCodigo: string,
  userRepo: UserRepository,
  areaRepo: AreaRepository,
): AreaFallbackResult {
  const area = areaRepo.getByCodigo(areaCodigo);
  if (!area) {
    return {
      areaCodigo,
      torre: null,
      isFallback: true,
      fallbackScope: 'none',
      contacts: [],
    };
  }

  // Requirement 5.1 — look for Command users in the area itself
  const areaUsers = userRepo.getByArea(areaCodigo);
  const commandUsersInArea = areaUsers.filter(u => u.perfil === 'Plantonista');

  if (commandUsersInArea.length > 0) {
    return {
      areaCodigo,
      torre: area.torre,
      isFallback: true,
      fallbackScope: 'area',
      contacts: commandUsersInArea.map(u => toFallbackContact(u, area)),
    };
  }

  // Requirement 5.2 — widen to the torre if the area has one
  if (area.torre) {
    const allAreas = areaRepo.getAll();
    const torreAreas = allAreas.filter(a => a.torre === area.torre);

    const torreContacts: FallbackContact[] = [];
    for (const torreArea of torreAreas) {
      const users = userRepo.getByArea(torreArea.codigo);
      const commandUsers = users.filter(u => u.perfil === 'Plantonista');
      for (const u of commandUsers) {
        torreContacts.push(toFallbackContact(u, torreArea));
      }
    }

    if (torreContacts.length > 0) {
      return {
        areaCodigo,
        torre: area.torre,
        isFallback: true,
        fallbackScope: 'torre',
        contacts: torreContacts,
      };
    }
  }

  return {
    areaCodigo,
    torre: area.torre,
    isFallback: true,
    fallbackScope: 'none',
    contacts: [],
  };
}

/** Helper that maps a User + Area to a FallbackContact DTO */
function toFallbackContact(user: User, area: Area): FallbackContact {
  return {
    id: user.id,
    nome: user.nome,
    cargo: user.cargo,
    areaCodigo: area.codigo,
    areaNome: area.nome,
  };
}
