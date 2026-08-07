import { query } from '../config/db.js';


// Buyer asks a question
export async function createQuestion(req, res) {

const {
productId,
question
} = req.body;


if(!productId || !question){

return res.status(400).json({

error:'Product and question are required.'

});

}


try {


const result = await query(

`
INSERT INTO product_questions
(
product_id,
buyer_id,
asked_by,
question
)

VALUES
($1,$2,$2,$3)

RETURNING *
`,

[
productId,
req.user.id,
question
]

);


return res.status(201).json({

message:'Question submitted',

question:result.rows[0]

});


}

catch(err){

console.error(
'Create question error:',
err
);


return res.status(500).json({

error:'Could not submit question'

});

}

}




// Seller/admin answers question

export async function answerQuestion(req,res){

const {
answer
}=req.body;


const {
id
}=req.params;


if(!answer){

return res.status(400).json({

error:'Answer is required'

});

}



try {

  // Confirm the caller actually owns the shop this question's product
  // belongs to (or is an admin) before letting them write an answer —
  // previously any authenticated buyer could answer any question on any
  // product, impersonating the seller.
  const questionRow = await query(
    `SELECT q.id, s.owner_id AS shop_owner_id
     FROM product_questions q
     JOIN products p ON p.id = q.product_id
     JOIN shops s ON s.id = p.shop_id
     WHERE q.id = $1`,
    [id]
  );
  if (questionRow.rows.length === 0) {
    return res.status(404).json({ error: 'Question not found' });
  }
  const isOwner = questionRow.rows[0].shop_owner_id === req.user.id;
  if (!isOwner && !req.user.isAdmin) {
    return res.status(403).json({ error: 'Only the shop that owns this product (or an admin) can answer this question.' });
  }


const result = await query(

`
UPDATE product_questions

SET

answer=$1,

answered_by=$2,

answered_at=now()


WHERE id=$3


RETURNING *

`,

[
answer,
req.user.id,
id
]

);



if(result.rows.length===0){

return res.status(404).json({

error:'Question not found'

});

}



return res.json({

message:'Answer submitted',

question:result.rows[0]

});


}

catch(err){

console.error(
'Answer question error:',
err
);


return res.status(500).json({

error:'Could not answer question'

});

}


}





// Get product questions

export async function getQuestions(req,res){

try{


const result = await query(

`

SELECT

q.*,

u.full_name AS buyer_name


FROM product_questions q


JOIN users u

ON u.id=q.buyer_id


WHERE q.product_id=$1


ORDER BY q.created_at DESC

`,

[
req.params.productId
]

);



return res.json({

questions:result.rows

});


}

catch(err){

console.error(err);


return res.status(500).json({

error:'Could not load questions'

});


}

}
