const STORE_NAME = "storedTransactions";

let transactions = [];
let myChart;

function getInfoFromServer() {
  fetch("/api/transaction")
    .then(response => {
      return response.json();
    })
    .then(data => {
      // save db data on global variable
      transactions = data;

      var storeTrans = openStore();
      storeTrans.onsuccess = () => {
        const db = storeTrans.result;
        const transaction = db.transaction([STORE_NAME], "readwrite");
        const transactionStore = transaction.objectStore(STORE_NAME);
        var getData = transactionStore.getAll();
        getData.onsuccess = () => {
          for (var i = 0; i < getData.result.length; i++) {
            var trans = getData.result[i];
            delete trans.id;
            transactions.unshift(trans);

          }
          populateTotal();
          populateTable();
          populateChart();
        }
      }
    });
}

function openStore() {
  const request = window.indexedDB.open(STORE_NAME, 1);

  request.onupgradeneeded = ({ target }) => {
    const db = target.result;
    const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
  };

  return request;
}

function deleteTransactionFromStore(id) {
  const storeTrans = openStore();
  storeTrans.onsuccess = () => {
    const db = storeTrans.result;
    const transaction = db.transaction([STORE_NAME], "readwrite");
    var deleteStore = transaction.objectStore(STORE_NAME);
    var deleteReq = deleteStore.delete(id);
    deleteReq.onerror = (err) => {
      console.log("Failed to delete");
    };
    deleteReq.onsuccess = () => {
      console.log("Entry Deleted");
    };
  }
}


SyncDataWithServer();

function SyncDataWithServer() {
  const storeTrans = openStore();
  storeTrans.onsuccess = () => {
    const db = storeTrans.result;
    const transaction = db.transaction([STORE_NAME], "readonly");
    const transactionStore = transaction.objectStore(STORE_NAME);

    var getData = transactionStore.getAll();
    getData.onsuccess = () => {
      console.log(getData.result);
      if(getData.result.length == 0){
        getInfoFromServer();
        return;
      }
      var numOfEntries = getData.result.length;
      var numDeleted = 0;
      getData.result.forEach((item, index)=>{
        const trans = item;
        const transToSend = { ...trans };
        delete transToSend.id;

        fetch("/api/transaction", {
          method: "POST",
          body: JSON.stringify(transToSend),
          headers: {
            Accept: "application/json, text/plain, */*",
            "Content-Type": "application/json"
          }
        }).then(response => {
          console.log("Entry Sent");
          
          deleteTransactionFromStore(trans.id);
          numDeleted++;
          if (numDeleted == numOfEntries) {
            getInfoFromServer();
          }
        }).catch((err) => {
          console.log(err);
          console.log("failed to sync");
          numDeleted++;
          if (numDeleted == numOfEntries) {
            getInfoFromServer();
          }
        });
      });
    };
    getData.onerror= (err)=>{
      console.log(err);
    };
  };
}

function saveRecord(newTrans) {
  const storeTrans = openStore();

  storeTrans.onsuccess = () => {
    const db = storeTrans.result;
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const transactionStore = transaction.objectStore(STORE_NAME);
    transactionStore.add(newTrans);
  };
}

window.addEventListener("online", (ev) => {
  SyncDataWithServer();
});


function populateTotal() {
  // reduce transaction amounts to a single total value
  let total = transactions.reduce((total, t) => {
    return total + parseInt(t.value);
  }, 0);

  let totalEl = document.querySelector("#total");
  totalEl.textContent = total;
}

function populateTable() {
  let tbody = document.querySelector("#tbody");
  tbody.innerHTML = "";

  transactions.forEach(transaction => {
    // create and populate a table row
    let tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${transaction.name}</td>
      <td>${transaction.value}</td>
    `;

    tbody.appendChild(tr);
  });
}

function populateChart() {
  // copy array and reverse it
  let reversed = transactions.slice().reverse();
  let sum = 0;

  // create date labels for chart
  let labels = reversed.map(t => {
    let date = new Date(t.date);
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  });

  // create incremental values for chart
  let data = reversed.map(t => {
    sum += parseInt(t.value);
    return sum;
  });

  // remove old chart if it exists
  if (myChart) {
    myChart.destroy();
  }

  let ctx = document.getElementById("myChart").getContext("2d");

  myChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: "Total Over Time",
        fill: true,
        backgroundColor: "#6666ff",
        data
      }]
    }
  });
}

function sendTransaction(isAdding) {
  let nameEl = document.querySelector("#t-name");
  let amountEl = document.querySelector("#t-amount");
  let errorEl = document.querySelector(".form .error");

  // validate form
  if (nameEl.value === "" || amountEl.value === "") {
    errorEl.textContent = "Missing Information";
    return;
  }
  else {
    errorEl.textContent = "";
  }

  // create record
  let transaction = {
    name: nameEl.value,
    value: amountEl.value,
    date: new Date().toISOString()
  };

  // if subtracting funds, convert amount to negative number
  if (!isAdding) {
    transaction.value *= -1;
  }

  // add to beginning of current array of data
  transactions.unshift(transaction);

  // re-run logic to populate ui with new record
  populateChart();
  populateTable();
  populateTotal();

  // also send to server
  fetch("/api/transaction", {
    method: "POST",
    body: JSON.stringify(transaction),
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json"
    }
  })
    .then(response => {
      SyncDataWithServer();
      return response.json();
    })
    .then(data => {
      if (data.errors) {
        errorEl.textContent = "Missing Information";
      }
      else {
        // clear form
        nameEl.value = "";
        amountEl.value = "";
      }
    })
    .catch(err => {
      // fetch failed, so save in indexed db
      saveRecord(transaction);

      // clear form
      nameEl.value = "";
      amountEl.value = "";
    });
}

document.querySelector("#add-btn").onclick = function () {
  sendTransaction(true);
};

document.querySelector("#sub-btn").onclick = function () {
  sendTransaction(false);
};
