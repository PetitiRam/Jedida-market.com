import { useNavigate } from "react-router-dom";

export default function BuyerProfile() {
  const navigate = useNavigate();

  const user = JSON.parse(localStorage.getItem("jedida_user") || "{}");

  return (
    <div className="max-w-4xl mx-auto p-6">

      <h1 className="text-3xl font-bold">
        My Account
      </h1>

      <div className="mt-6 bg-white rounded-xl shadow p-6">

        <h2 className="text-xl font-semibold">
          Account Information
        </h2>

        <div className="mt-4 space-y-3">

          <p>
            <strong>Name:</strong> {user.fullName}
          </p>

          <p>
            <strong>Email:</strong> {user.email}
          </p>

          <p>
            <strong>Phone:</strong> {user.phoneNumber}
          </p>

          <p>
            <strong>Username:</strong> {user.username}
          </p>

          <p>
            <strong>Current Account:</strong> Buyer
          </p>

        </div>

      </div>

      <div className="mt-8 bg-yellow-50 border rounded-xl p-6">

        <h2 className="text-2xl font-bold">
          Grow with JEDIDA
        </h2>

        <p className="mt-2 text-gray-600">
          Your account is currently a Buyer account.
          Upgrade to start selling products or delivering orders.
        </p>

        <div className="grid md:grid-cols-2 gap-5 mt-6">

          <div className="border rounded-xl p-5">

            <h3 className="text-xl font-semibold">
              Become a Seller
            </h3>

            <p className="mt-2">
              Open your own shop, list products and receive orders.
            </p>

            <button
              onClick={() => navigate("/seller/upgrade")}
              className="mt-4 w-full bg-black text-white py-3 rounded-lg"
            >
              Become Seller
            </button>

          </div>

          <div className="border rounded-xl p-5">

            <h3 className="text-xl font-semibold">
              Become Delivery Partner
            </h3>

            <p className="mt-2">
              Deliver customer orders and earn from deliveries.
            </p>

            <button
              onClick={() => navigate("/delivery/upgrade")}
              className="mt-4 w-full bg-green-600 text-white py-3 rounded-lg"
            >
              Become Delivery
            </button>

          </div>

        </div>

      </div>

    </div>
  );
}
