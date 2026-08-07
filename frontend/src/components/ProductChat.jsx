import { useState } from 'react';
import client from '../api/client';


export default function ProductChat({product}) {


const [open,setOpen] = useState(false);

const [message,setMessage] = useState('');

const [messages,setMessages] = useState([]);


const sendMessage = async()=>{


if(!message.trim()) return;


const newMessage = {

sender:'buyer',

text:message

};


setMessages([
...messages,
newMessage
]);


setMessage('');



try{


await client.post('/chat/messages',{

receiverId: product.shop_id,

productId: product.id,

message:newMessage.text


});


}

catch(err){

console.log(
'Message failed',
err
);

}


};



return (

<>


{/* Floating Button */}

<button

onClick={()=>setOpen(!open)}

style={{

position:'fixed',

right:25,

bottom:25,

width:60,

height:60,

borderRadius:'50%',

background:'#008c45',

color:'#fff',

border:'none',

fontSize:25,

cursor:'pointer',

zIndex:1000

}}

>

💬

</button>





{
open &&

<div

style={{

position:'fixed',

right:25,

bottom:95,

width:330,

height:420,

background:'#fff',

borderRadius:15,

boxShadow:'0 5px 25px rgba(0,0,0,.2)',

display:'flex',

flexDirection:'column',

zIndex:1000

}}

>



<div

style={{

padding:15,

background:'#008c45',

color:'#fff',

borderRadius:'15px 15px 0 0'

}}

>

Chat with {product.shop_name}

</div>




<div

style={{

flex:1,

padding:15,

overflowY:'auto'

}}

>


{
messages.map((m,index)=>(


<div

key={index}

style={{

marginBottom:10,

padding:8,

background:'#eee',

borderRadius:8

}}

>

{m.text}

</div>


))

}


</div>





<div

style={{

display:'flex',

padding:10,

borderTop:'1px solid #ddd'

}}

>


<input

value={message}

onChange={(e)=>setMessage(e.target.value)}

placeholder="Type message..."

style={{

flex:1,

padding:8

}}

/>



<button

onClick={sendMessage}

>

Send

</button>


</div>



</div>

}



</>

);


}
