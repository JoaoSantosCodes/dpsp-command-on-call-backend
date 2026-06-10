import { Request, Response, NextFunction } from 'express';
import { AuthService, TokenPayload } from '../services/auth';
import { UserPerfil } from '../../shared/types';

// Extend Express Request to include user data and selected area
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
      selectedArea?: string | null;
    }
  }
}

export function createAuthMiddleware(authService: AuthService) {
  return function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Token não fornecido' });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    const payload = authService.validateToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Token inválido ou expirado' });
      return;
    }

    req.user = payload;

    // Extract selected area from header (set after POST /api/auth/select-area)
    const selectedArea = req.headers['x-selected-area'] as string | undefined;
    if (selectedArea) {
      req.selectedArea = selectedArea;
    } else {
      req.selectedArea = payload.areaCodigo;
    }

    next();
  };
}

/**
 * Middleware factory that restricts route access by user profile.
 * Returns 403 if the user's profile is not in the allowed list.
 *
 * Usage: roleMiddleware(['Adm', 'Responsavel'])
 */
export function roleMiddleware(allowedProfiles: UserPerfil[]) {
  return function (req: Request, res: Response, next: NextFunction): void {
    if (!req.user) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    if (!allowedProfiles.includes(req.user.perfil)) {
      res.status(403).json({ error: 'Acesso não autorizado para este perfil' });
      return;
    }

    next();
  };
}

/**
 * Filters data based on the user's profile and area.
 * - Adm: access to all areas (no filtering)
 * - Responsavel: access only to their own area_codigo
 * - Plantonista: read-only access to their own schedule/area
 *
 * Sets req.selectedArea for downstream use. If the user is Adm,
 * selectedArea may be null (meaning all areas).
 */
export function areaFilterMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Usuário não autenticado' });
    return;
  }

  const { perfil, areaCodigo } = req.user;

  if (perfil === 'Adm') {
    // Adm can select any area or see all
    // selectedArea already set from header or defaults to null (all)
    if (!req.selectedArea) {
      req.selectedArea = null;
    }
  } else if (perfil === 'Responsavel') {
    // Responsavel can only access their linked area
    // If a selected area header is provided, validate it matches their area
    if (req.selectedArea && req.selectedArea !== areaCodigo) {
      res.status(403).json({ error: 'Acesso restrito à sua área de responsabilidade' });
      return;
    }
    req.selectedArea = areaCodigo;
  } else if (perfil === 'Plantonista') {
    // Plantonista only has read access to their own area
    req.selectedArea = areaCodigo;
  }

  next();
}

/**
 * Utility to get the effective area filter for queries.
 * Returns null if user has access to all areas (Adm without selection),
 * or the specific area code to filter by.
 */
export function getEffectiveAreaFilter(req: Request): string | null {
  if (req.user?.perfil === 'Adm') {
    // Adm can optionally filter by area via header or query param
    return req.selectedArea || null;
  }
  // For non-Adm users, always filter by their area
  return req.selectedArea || req.user?.areaCodigo || null;
}
