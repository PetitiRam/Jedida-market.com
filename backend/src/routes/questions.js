import express from 'express';
import { requireAuth } from '../middleware/auth.js';

import {

createQuestion,

answerQuestion,

getQuestions

} from '../controllers/questionController.js';


const router = express.Router();



router.post(
'/',
requireAuth,
createQuestion
);



router.put(
'/:id/answer',
requireAuth,
answerQuestion
);



router.get(
'/:productId',
getQuestions
);



export default router;
