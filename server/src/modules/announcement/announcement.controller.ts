import type { NextFunction, Request, Response } from "express"

import {
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncement,
  listAnnouncements,
  updateAnnouncement,
} from "./announcement.service"
import {
  announcementQuery,
  createAnnouncementBody,
  updateAnnouncementBody,
} from "./announcement.validators"

type RequestWithId = Request<{ id: string }>

export async function listAnnouncementsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { limit } = announcementQuery.parse(req.query)
    return res.status(200).json(await listAnnouncements(req.user!, limit))
  } catch (err) {
    return next(err)
  }
}

export async function getAnnouncementHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(await getAnnouncement(req.user!, req.params.id))
  } catch (err) {
    return next(err)
  }
}

export async function createAnnouncementHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createAnnouncementBody.parse(req.body)
    return res.status(201).json(await createAnnouncement(req.user!, body))
  } catch (err) {
    return next(err)
  }
}

export async function updateAnnouncementHandler(
  req: RequestWithId,
  res: Response,
  next: NextFunction
) {
  try {
    const body = updateAnnouncementBody.parse(req.body)
    return res.status(200).json(await updateAnnouncement(req.user!, req.params.id, body))
  } catch (err) {
    return next(err)
  }
}

export async function deleteAnnouncementHandler(
  req: RequestWithId,
  res: Response,
  next: NextFunction
) {
  try {
    await deleteAnnouncement(req.user!, req.params.id)
    return res.status(204).send()
  } catch (err) {
    return next(err)
  }
}
