pipeline {
  agent any

  environment {
    AWS_REGION = "us-west-2"
    CLUSTER_NAME = "my-eks-cluster"
  }

  stages {
    stage('Build Frontend Image') {
      steps {
        dir('frontend') {
          sh 'docker build -t my-frontend:latest .'
        }
      }
    }

    stage('Build Backend Image') {
      steps {
        dir('backend') {
          sh 'docker build -t my-backend:latest .'
        }
      }
    }

    stage('Push Images to ECR') {
      steps {
        script {
          sh '''
            aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin 889818960214.dkr.ecr.$AWS_REGION.amazonaws.com

            docker tag my-frontend:latest 889818960214.dkr.ecr.$AWS_REGION.amazonaws.com/my-frontend:latest
            docker tag my-backend:latest 889818960214.dkr.ecr.$AWS_REGION.amazonaws.com/my-backend:latest

            docker push 889818960214.dkr.ecr.$AWS_REGION.amazonaws.com/my-frontend:latest
            docker push 889818960214.dkr.ecr.$AWS_REGION.amazonaws.com/my-backend:latest
          '''
        }
      }
    }

    stage('Update Kubeconfig') {
      steps {
        sh '''
          aws eks update-kubeconfig --name $CLUSTER_NAME --region $AWS_REGION
        '''
      }
    }

    stage('Deploy K8s Resources') {
      steps {
        sh '''
          kubectl apply -f k8s/aws-load-balancer-controller-service-account.yaml
          kubectl apply -f k8s/ingress-class.yaml
          kubectl apply -f k8s/ingress.yaml
        '''
      }
    }

    stage('Verify Ingress') {
      steps {
        sh 'kubectl get ingress -A'
      }
    }
  }
}
