import { Request, Response, NextFunction } from 'express';
import { AuthService, TokenPayload } from '../services/auth';
import { UserAreaRepository } from '../database/repositories/UserAreaRepository';
import { UserPerfil } from '../../shared/types';

// Extend Express Request to include user data and selected area
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
      selectedArea?: string | null;
      linkedAreas?: string[];
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
    } else if (payload.perfil === 'Adm') {
      // Adm without explicit header selection sees all areas
      req.selectedArea = null;
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
 * - Responsavel: access only to their linked areas (from user_areas table)
 * - Plantonista: read-only access to their own schedule/area
 *
 * Sets req.selectedArea for downstream use. If the user is Adm,
 * selectedArea may be null (meaning all areas).
 *
 * This is the basic (sync) version that does NOT load linked areas from DB.
 * Use createAreaFilterMiddleware(userAreaRepository) for DB-backed multi-area filtering.
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
      // Check if it's one of their linked areas
      if (req.linkedAreas && req.linkedAreas.includes(req.selectedArea)) {
        // Allow - it's one of their linked areas
      } else {
        res.status(403).json({ error: 'Acesso restrito à sua área de responsabilidade' });
        return;
      }
    }
    if (!req.selectedArea) {
      req.selectedArea = areaCodigo;
    }
  } else if (perfil === 'Plantonista') {
    // Plantonista only has read access to their own area
    req.selectedArea = areaCodigo;
  }

  next();
}

/**
 * Factory function that creates an area filter middleware with DB access.
 * Loads linked areas from user_areas table for Responsável users.
 */
export function createAreaFilterMiddleware(userAreaRepository: UserAreaRepository) {
  return function (req: Request, res: Response, next: NextFunction): void {
    if (!req.user) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const { perfil, areaCodigo, userId } = req.user;

    if (perfil === 'Adm') {
      // Adm can select any area or see all
      if (!req.selectedArea) {
        req.selectedArea = null;
      }
      next();
      return;
    }

    if (perfil === 'Responsavel') {
      // Load linked areas from user_areas table
      const linkedAreas = userAreaRepository.getAreasForUser(userId);
      req.linkedAreas = linkedAreas;

      // If a selected area header is provided, validate it's one of their linked areas or primary area
      if (req.selectedArea) {
        const allAllowedAreas = areaCodigo ? [...linkedAreas, areaCodigo] : linkedAreas;
        if (!allAllowedAreas.includes(req.selectedArea)) {
          res.status(403).json({ error: 'Acesso restrito à sua área de responsabilidade' });
          return;
        }
      } else {
        req.selectedArea = areaCodigo;
      }
      next();
      return;
    }

    if (perfil === 'Plantonista') {
      // Plantonista only has read access to their own area
      req.selectedArea = areaCodigo;
    }

    next();
  };
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

/**
 * Returns the list of all areas a Responsável user has access to.
 * This includes both the primary areaCodigo and any linked areas from user_areas.
 * For Adm, returns null (meaning all areas).
 * For Plantonista, returns their single area.
 */
export function getEffectiveAreas(req: Request): string[] | null {
  if (!req.user) return null;

  if (req.user.perfil === 'Adm') {
    // Adm without selection means all areas
    if (!req.selectedArea) return null;
    return [req.selectedArea];
  }

  if (req.user.perfil === 'Responsavel') {
    const areas: string[] = [];
    if (req.user.areaCodigo) areas.push(req.user.areaCodigo);
    if (req.linkedAreas) {
      for (const a of req.linkedAreas) {
        if (!areas.includes(a)) areas.push(a);
      }
    }
    return areas.length > 0 ? areas : (req.user.areaCodigo ? [req.user.areaCodigo] : []);
  }

  // Plantonista
  return req.user.areaCodigo ? [req.user.areaCodigo] : [];
}

/**
 * Middleware that blocks write operations (POST, PUT, DELETE) from Plantonista users.
 * Returns 403 with message 'Acesso somente leitura para Plantonista'.
 */
export function writeBlockMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Usuário não autenticado' });
    return;
  }

  if (req.user.perfil === 'Plantonista' && ['POST', 'PUT', 'DELETE'].includes(req.method)) {
    res.status(403).json({ error: 'Acesso somente leitura para Plantonista' });
    return;
  }

  next();
}
