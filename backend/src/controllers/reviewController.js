import { query } from '../config/db.js';


// Create product review
export async function createReview(req,res){

const {
productId,
rating,
comment
}=req.body;


if(!productId || !rating){

return res.status(400).json({
error:'Product and rating are required.'
});

}


try{


const result = await query(

`
INSERT INTO product_reviews
(
product_id,
buyer_id,
rating,
comment
)

VALUES
($1,$2,$3,$4)

RETURNING *
`,

[
productId,
req.user.id,
rating,
comment || null
]

);



return res.status(201).json({

message:'Review submitted',

review:result.rows[0]

});


}

catch(err){

console.error(
'Review error:',
err
);


return res.status(500).json({

error:'Could not submit review'

});


}

}




// Get reviews for product

export async function getReviews(req,res){

try{


const result = await query(

`

SELECT

r.*,

u.full_name AS buyer_name


FROM product_reviews r

JOIN users u

ON u.id=r.buyer_id


WHERE r.product_id=$1


ORDER BY r.created_at DESC

`,

[req.params.productId]

);



return res.json({

reviews:result.rows

});


}

catch(err){

console.error(
err
);


return res.status(500).json({

error:'Could not load reviews'

});


}

}
